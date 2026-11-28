import "server-only";
import type { SessionUser } from "@/server/auth/session";
import { transaction, within } from "@/server/db/transaction";
import { AppError } from "@/server/http/errors";
import {
  stagesJson,
  toAdvancedQuestionConfiguration,
  toEventColumns,
  toQuestionsPayload,
  toRoundsPayload,
  toTimelinePayload,
  type EventColumns,
  type QuestionPayloadItem,
} from "@/lib/event-draft/payloads";
import type { EventDetailData, EventQuestionOptionData } from "@/lib/zod/event";
import {
  createQuestionsRepository,
  type QuestionsRepository,
} from "@/server/modules/questions/questions.repository";
import type { EventQuestion } from "@/server/modules/questions/questions.schemas";
import { listQuestions } from "@/server/modules/questions/questions.service";
import {
  createEventsRepository,
  type EventsRepository,
} from "./events.repository";
import type {
  PatchEventBody,
  SaveEventBody,
  SaveEventResult,
} from "./events.schemas";
import { BASE_PATH } from "@/lib/base-path";

// Organizer writes. Saving an event used to be ~10 separate browser calls
// (row, links, media, timeline, rounds, questions, re-read questions,
// advanced tree, FAQs, categories); a failure part-way left a half-saved
// event. Now it's one request and one transaction: all of it or none.
//
// "What changed" (questions, stages, FAQs, categories) is worked out from
// the database, not from what the browser says the event used to be.

// Covers are stored in the database and served from our own origin.
const COVER_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const MAX_COVER_BYTES = 10 * 1024 * 1024;

// The saved state the save diffs against; null when creating.
interface Previous {
  hadStages: boolean;
  wasAdvanced: boolean;
  questions: EventQuestion[];
  categoryIds: number[];
  faqCount: number;
  partnerCount: number;
  cardImageUrl: string | null;
}

const actor = (user: SessionUser) => user.email || user.fullName || user.userId;

export const eventsWriteService = {
  async create(
    body: SaveEventBody,
    user: SessionUser,
  ): Promise<SaveEventResult> {
    const { draft, statusId } = body;
    if (draft.type === null)
      throw AppError.badRequest("Choose an event type before saving");

    return transaction(async (tx) => {
      const events = createEventsRepository(within(tx));
      const questions = createQuestionsRepository(within(tx));

      const id = await events.create(
        {
          ...toEventColumns(draft),
          ...stagesColumn(draft, false),
          status_id: statusId,
        },
        { createdBy: actor(user), organizerId: user.userId },
      );
      await saveChildren(events, questions, id, draft, null);
      return { id };
    });
  },

  async update(
    id: number,
    body: SaveEventBody,
    user: SessionUser,
  ): Promise<SaveEventResult> {
    const { draft, statusId } = body;
    if (draft.type === null)
      throw AppError.badRequest("Choose an event type before saving");

    return transaction(async (tx) => {
      const events = createEventsRepository(within(tx));
      const questions = createQuestionsRepository(within(tx));

      const saved = await events.getById(id);
      if (!saved) throw AppError.notFound("Event");
      const [wasAdvanced, savedQuestions, categoryIds, faqCount, partnerCount] =
        await Promise.all([
          questions.advancedEnabled(id),
          listQuestions(id, questions),
          events.categoryIds(id),
          events.faqCount(id),
          events.partnerCount(id),
        ]);
      const previous: Previous = {
        hadStages: stageCount(saved.stages_json) > 0,
        wasAdvanced,
        questions: savedQuestions,
        categoryIds,
        faqCount,
        partnerCount,
        cardImageUrl: saved.card_image_url ?? null,
      };

      await events.update(
        id,
        {
          ...toEventColumns(draft),
          ...stagesColumn(draft, previous.hadStages),
          status_id: statusId,
        },
        actor(user),
      );
      await saveChildren(events, questions, id, draft, previous);
      return { id };
    });
  },

  async patch(
    id: number,
    body: PatchEventBody,
    user: SessionUser,
  ): Promise<void> {
    const columns: Partial<EventColumns> = {
      status_id: body.statusId,
      rating_mode: body.ratingMode,
      attendee_registration_enabled:
        body.attendeeRegistrationEnabled === undefined
          ? undefined
          : body.attendeeRegistrationEnabled
            ? 1
            : 0,
      participant_registration_enabled:
        body.participantRegistrationEnabled === undefined
          ? undefined
          : body.participantRegistrationEnabled
            ? 1
            : 0,
    };
    await transaction(async (tx) => {
      const events = createEventsRepository(within(tx));
      if (!(await events.exists(id))) throw AppError.notFound("Event");
      await events.update(id, columns, actor(user));
    });
  },

  async uploadCover(
    id: number,
    bytes: Buffer,
    contentType: string | null,
  ): Promise<void> {
    const mime = checkImage(bytes, contentType, "Cover");
    const events = createEventsRepository();
    if (!(await events.setCoverImage(id, bytes, mime)))
      throw AppError.notFound("Event");
  },

  async uploadCard(
    id: number,
    bytes: Buffer,
    contentType: string | null,
  ): Promise<void> {
    const mime = checkImage(bytes, contentType, "Card image");
    const events = createEventsRepository();
    if (!(await events.setCardImage(id, bytes, mime)))
      throw AppError.notFound("Event");
  },
};

// The normalized MIME type of an uploaded cover/card image, or a 400.
function checkImage(
  bytes: Buffer,
  contentType: string | null,
  what: string,
): string {
  const mime = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!COVER_TYPES.has(mime)) {
    throw AppError.badRequest(
      `${what} must be a JPEG, PNG, WebP, GIF or AVIF image`,
    );
  }
  if (bytes.length === 0) throw AppError.badRequest("The image is empty");
  if (bytes.length > MAX_COVER_BYTES)
    throw AppError.badRequest(`${what} must be 10 MB or smaller`);
  return mime;
}

function stageCount(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

// Days work for every event mode. "[]" clears stages that were saved
// earlier (update_event can't clear with NULL). Nothing to write and nothing
// to clear → leave the column out entirely.
function stagesColumn(
  draft: EventDetailData,
  hadStages: boolean,
): Pick<EventColumns, "stages_json"> {
  if (draft.stages.length === 0 && !hadStages) return {};
  const value = stagesJson(draft, hadStages);
  return value === undefined ? {} : { stages_json: value };
}

// A local preview (blob:/data:) is never stored: the browser uploads the
// bytes to /card-image after the save, which sets the URL itself.
function isLocalPreview(url: string): boolean {
  return /^(blob:|data:)/i.test(url);
}

async function saveChildren(
  events: EventsRepository,
  questions: QuestionsRepository,
  id: number,
  draft: EventDetailData,
  previous: Previous | null,
): Promise<void> {
  // Full-replace collections: an empty array is how a list is cleared.
  const links = draft.socialLinks
    .filter((l) => l.url.trim() !== "")
    .map(({ platform, url }) => ({ platform, url }));
  await events.replaceChildren(id, "social_links", JSON.stringify(links));

  const media = draft.mediaUrls
    .filter((url) => url.trim() !== "")
    .map((url, sortOrder) => ({ url, sortOrder }));
  await events.replaceChildren(id, "media", JSON.stringify(media));

  await events.replaceChildren(
    id,
    "timeline",
    JSON.stringify(toTimelinePayload(draft)),
  );

  // TODO(rounds): rounds belong to the Rounds tab, not the event editor —
  // drop this once that page owns them.
  await events.replaceRounds(id, JSON.stringify(toRoundsPayload(draft)));

  // replace_questions deletes and recreates every question (and with them
  // submitted answers), so it only runs when the questions really changed.
  const questionsPayload = toQuestionsPayload(draft);
  const questionsChanged =
    !previous ||
    JSON.stringify(questionsPayloadOf(previous.questions)) !==
      JSON.stringify(questionsPayload);
  if (questionsChanged)
    await questions.replace(id, JSON.stringify(questionsPayload));

  await saveAdvancedQuestions(
    questions,
    id,
    draft,
    previous?.wasAdvanced ?? false,
    questionsChanged,
  );

  // FAQs: write when there's something to save or something to clear.
  const faqs = draft.faqs
    .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
    .filter((f) => f.question && f.answer)
    .map((f, sortOrder) => ({ ...f, sortOrder }));
  if (faqs.length > 0 || (previous?.faqCount ?? 0) > 0) {
    await events.replaceChildren(id, "faqs", JSON.stringify(faqs));
  }

  // Co-branding partners: nameless rows dropped, blank role defaults. Only
  // written when there's something to save or something to clear.
  const partners = draft.partners
    .map((p) => ({
      name: p.name.trim(),
      role: p.role.trim() || "In association with",
      logoUrl: isLocalPreview(p.logoUrl) ? null : p.logoUrl.trim() || null,
      url: p.url.trim() || null,
      about: p.about.trim() || null,
    }))
    .filter((p) => p.name);
  if (partners.length > 0 || (previous?.partnerCount ?? 0) > 0) {
    await events.replacePartners(id, partners);
  }

  // A linked card image (or clearing it). Uploaded images keep the URL the
  // upload set, which the editor sends back as <base>/api/v1/events/:id/card-image.
  const card = draft.cardImageUrl.trim();
  if (!isLocalPreview(card) && !isServedCard(card, id)) {
    const next = card || null;
    if (next !== (previous?.cardImageUrl ?? null))
      await events.setCardImageUrl(id, next);
  }

  const before = new Set(previous?.categoryIds ?? []);
  const after = new Set(draft.categoryIds);
  for (const categoryId of after) {
    if (!before.has(categoryId)) await events.assignCategory(id, categoryId);
  }
  for (const categoryId of before) {
    if (!after.has(categoryId)) await events.removeCategory(id, categoryId);
  }
}

// The uploaded card image, as the editor got it back from the mapper.
function isServedCard(url: string, id: number): boolean {
  return url === `${BASE_PATH}/api/v1/events/${id}/card-image`;
}

// The saved questions in the same shape toQuestionsPayload produces, so the
// two can be compared to tell whether the organizer changed anything.
function questionsPayloadOf(saved: EventQuestion[]): QuestionPayloadItem[] {
  return [...saved]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((q) => q.prompt.trim() !== "")
    .map((q, index) => ({
      prompt: q.prompt,
      questionType: q.type,
      isRequired: q.required ? 1 : 0,
      appliesTo: q.appliesTo,
      sortOrder: index,
      options:
        q.type === "TEXT"
          ? []
          : [...q.options]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .filter((o) => o.label.trim() !== "")
              .map((o, optionIndex) => ({
                label: o.label,
                sortOrder: optionIndex,
              })),
    }));
}

// Follow-up choices under CHECKBOX options. They hang off question/option
// ids, so they're saved after the questions, against the ids the database
// holds now. If the questions were just recreated, every id is new: the
// old follow-up ids are dropped so they attach to the fresh options.
async function saveAdvancedQuestions(
  questions: QuestionsRepository,
  id: number,
  draft: EventDetailData,
  wasAdvanced: boolean,
  questionsChanged: boolean,
): Promise<void> {
  const enabled = draft.advancedAdditionalQuestionsEnabled;
  if (!enabled && !wasAdvanced) return;
  if (enabled && !wasAdvanced) await questions.setAdvancedEnabled(id, true);

  const saved = await listQuestions(id, questions);
  const resetIds = (
    option: EventQuestionOptionData,
  ): EventQuestionOptionData => ({
    ...option,
    id: questionsChanged ? null : option.id,
    advancedOptions: option.advancedOptions.map(resetIds),
  });
  const configured = draft.questions
    .filter((q) => q.prompt.trim())
    .map((q, qi) => {
      const savedOptions = saved[qi]?.options ?? [];
      return {
        ...q,
        id: saved[qi]?.id ?? q.id,
        options: q.options
          .filter((o) => o.label.trim())
          .map((o, oi) => ({
            ...o,
            id: savedOptions[oi]?.id ?? o.id,
            advancedOptions: o.advancedOptions.map(resetIds),
          })),
      };
    });
  await questions.saveAdvancedConfiguration(
    id,
    JSON.stringify(
      toAdvancedQuestionConfiguration({ ...draft, questions: configured }),
    ),
  );
  if (!enabled) await questions.setAdvancedEnabled(id, false);
}
