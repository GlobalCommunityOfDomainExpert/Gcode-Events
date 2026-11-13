import {
  createEvent,
  updateEvent,
  replaceEventSocialLinks,
  replaceEventFaqs,
  replaceEventMedia,
  replaceEventTimeline,
  replaceEventQuestions,
  setEventAdvancedEnabled,
  listEventQuestions,
  saveAdvancedQuestionConfiguration,
  uploadCoverImage,
  assignCategory,
  removeCategory,
} from "@/lib/api/events";
import { replaceEventRounds } from "@/lib/api/rounds";
import { getModes } from "@/lib/api/lookups";
import {
  toCreatePayload,
  toTimelinePayload,
  toQuestionsPayload,
  toRoundsPayload,
  toAdvancedQuestionConfiguration,
  stagesJson,
} from "@/lib/api/adapters";
import { EventDetailData } from "@/lib/zod/event";

// Shared by the editor's create and edit paths.
//
// Order (everything after step 1 is best-effort for FAQs only; the rest keep
// the real wizard's behaviour of surfacing the error):
//   1 event row (stages_json only for Hybrid, D6)
//   2 social links + media (full replace)
//   3 timeline (day_label only when set, D8)
//   4 rounds (D1)  // TODO(dashboard-port): remove once the Rounds page exists
//   5 questions, only when changed (D3)
//   6 advanced-question pipeline (D4)
//   7 FAQs, only when non-empty or previously non-empty (D7, soft-fail)
//   8 cover upload through the real endpoint (D5)
//   9 categories

export interface SaveResult {
  id: number | string;
  /** Non-fatal problems — the event itself was saved. */
  warnings: string[];
}

/** D6 — the `stages_json` key for the event row, or nothing at all. */
async function stagesField(
  data: EventDetailData,
  initialData?: EventDetailData,
): Promise<{ stages_json?: string | null }> {
  const hadStages = (initialData?.stages.length ?? 0) > 0;
  // Nothing to write and nothing to clear: never touch the column, so a
  // backend that doesn't have it yet is unaffected.
  if (data.stages.length === 0 && !hadStages) return {};
  let isHybrid = false;
  try {
    const modes = await getModes();
    isHybrid = modes.find((m) => m.id === data.mode)?.mode_name === "HYBRID";
  } catch {
    return {}; // can't tell the mode — leave stages alone
  }
  const value = stagesJson(data, hadStages, isHybrid);
  return value === undefined ? {} : { stages_json: value };
}

async function persistCategories(
  id: number | string,
  data: EventDetailData,
  originalIds: number[],
) {
  const original = new Set(originalIds);
  const current = new Set(data.categoryIds);
  const toAdd = data.categoryIds.filter((c) => !original.has(c));
  const toRemove = originalIds.filter((c) => !current.has(c));
  await Promise.all([
    ...toAdd.map((categoryId) => assignCategory(id, categoryId)),
    ...toRemove.map((categoryId) => removeCategory(id, categoryId)),
  ]);
}

async function persistChildCollections(
  id: number | string,
  data: EventDetailData,
  initialData: EventDetailData | undefined,
  warnings: string[],
) {
  // Full-replace endpoints (DELETE then re-INSERT): an empty array is how the
  // user clears a collection down to nothing.
  const links = data.socialLinks.filter((l) => l.url.trim() !== "");
  await replaceEventSocialLinks(id, links);

  const media = data.mediaUrls
    .filter((url) => url.trim() !== "")
    .map((url, index) => ({ url, sortOrder: index }));
  await replaceEventMedia(id, media);

  await replaceEventTimeline(id, toTimelinePayload(data));

  // TODO(dashboard-port): remove once the dashboard Rounds page exists —
  // rounds are meant to be saved there, never from here.
  await replaceEventRounds(id, toRoundsPayload(data));

  // D3 — the /questions route deletes and recreates every question, so only
  // call it when the questions actually changed (edits must not touch
  // questions when registrations exist).
  const questionsChanged =
    !initialData ||
    JSON.stringify(toQuestionsPayload(initialData)) !==
      JSON.stringify(toQuestionsPayload(data));
  if (questionsChanged) {
    await replaceEventQuestions(id, toQuestionsPayload(data));
  }

  // D4 — advanced (follow-up) question pipeline, as in the real wizard.
  const wasAdvanced = initialData?.advancedAdditionalQuestionsEnabled ?? false;
  if (data.advancedAdditionalQuestionsEnabled || wasAdvanced) {
    if (data.advancedAdditionalQuestionsEnabled && !wasAdvanced) {
      await setEventAdvancedEnabled(id, true);
    }
    const savedQuestions = await listEventQuestions(id);
    const resetAdvancedIds = (
      option: EventDetailData["questions"][number]["options"][number],
    ): EventDetailData["questions"][number]["options"][number] => ({
      ...option,
      id: questionsChanged ? null : option.id,
      advancedOptions: option.advancedOptions.map(resetAdvancedIds),
    });
    const configured = data.questions
      .filter((q) => q.prompt.trim())
      .map((q, qi) => {
        const saved = savedQuestions[qi];
        const opts =
          typeof saved?.options === "string"
            ? JSON.parse(saved.options)
            : (saved?.options ?? []);
        return {
          ...q,
          id: saved?.id ?? q.id,
          options: q.options
            .filter((o) => o.label.trim())
            .map((o, oi) => ({
              ...o,
              id: opts[oi]?.id ?? o.id,
              // The legacy save route recreates base option IDs, so new
              // advanced choices must attach to those freshly saved IDs.
              advancedOptions: o.advancedOptions.map(resetAdvancedIds),
            })),
        };
      });
    await saveAdvancedQuestionConfiguration(
      id,
      toAdvancedQuestionConfiguration({ ...data, questions: configured }),
    );
    if (!data.advancedAdditionalQuestionsEnabled) {
      await setEventAdvancedEnabled(id, false);
    }
  }

  // D7 — FAQs only when there's something to write or clear. A failure is a
  // warning: the event is saved either way.
  const faqs = data.faqs
    .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
    .filter((f) => f.question && f.answer);
  if (faqs.length > 0 || (initialData?.faqs.length ?? 0) > 0) {
    try {
      await replaceEventFaqs(id, faqs);
    } catch {
      warnings.push("FAQs couldn't be saved");
    }
  }

  // D5 — cover image: recover the bytes from the blob: preview URL and send
  // them through the real upload endpoint.
  if (data.coverImageUrl.startsWith("blob:")) {
    const blob = await fetch(data.coverImageUrl).then((r) => r.blob());
    await uploadCoverImage(id, blob);
  }
}

export async function createEventFromDraft(
  data: EventDetailData,
  statusId: number | undefined,
): Promise<SaveResult> {
  const warnings: string[] = [];
  const { id } = await createEvent({
    ...toCreatePayload(data),
    ...(await stagesField(data)),
    status_id: statusId,
  });
  await persistChildCollections(id, data, undefined, warnings);
  await persistCategories(id, data, []);
  return { id, warnings };
}

export async function updateEventFromDraft(
  eventId: string,
  data: EventDetailData,
  statusId: number | undefined,
  initialData: EventDetailData,
): Promise<SaveResult> {
  const warnings: string[] = [];
  await updateEvent(eventId, {
    ...toCreatePayload(data),
    ...(await stagesField(data, initialData)),
    status_id: statusId,
  });
  await persistChildCollections(eventId, data, initialData, warnings);
  await persistCategories(eventId, data, initialData.categoryIds);
  return { id: eventId, warnings };
}
