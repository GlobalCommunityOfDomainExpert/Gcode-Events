// The event editor's draft (EventDetailData) ⇄ API shapes: blank and
// preview details for the live preview, the saved event → draft prefill,
// and draft → create/timeline payloads.

import { EventDetailData } from "@/lib/zod/event";
import type {
  EventDetail,
  EventPartnerItem,
  EventTimelineEntry,
} from "@/server/modules/events/events.schemas";
import type { EventRound as EventRoundDto } from "@/server/modules/rounds/rounds.schemas";
import type { EventQuestion as EventQuestionDto } from "@/server/modules/questions/questions.schemas";
import { stagesJson } from "@/lib/event-draft/payloads";
import { adaptTimelineItem, parseStages } from "./event";
import { resolveImageUrl } from "./format";
import { istDate, istTime, toIsoTimestamp } from "@/lib/datetime/ist";
import { adaptEventQuestion } from "./questions";
import { adaptEventRound } from "./rounds";

// Stand-in saved row for a brand-new event, so the editor's preview has
// server-owned values (no registrations yet) to overlay the draft onto.
export function blankEventDetail(organizerName = "You"): EventDetail {
  return {
    id: 0,
    title: "",
    eventTypeId: 0,
    modeOfEventId: 1,
    statusId: 0,
    city: "",
    address: null,
    startDate: null,
    endDate: null,
    maxAttendees: null,
    ticketPrice: 0,
    isFeatured: false,
    coverImageUrl: null,
    cardImageUrl: null,
    bannerImageUrl: null,
    participationLink: null,
    registeredCount: 0,
    summary: null,
    description: null,
    durationText: null,
    terms: null,
    eligibility: null,
    stagesJson: null,
    certificateOffered: false,
    organizerId: null,
    organizerName,
    createdBy: null,
    createdOn: new Date().toISOString(),
    updatedBy: null,
    updatedOn: null,
    categoryIds: [],
    categoryNames: [],
    interestedCount: 0,
    attendeeRegistrationEnabled: true,
    attendeeLabel: null,
    attendeeDescription: null,
    registrationStart: null,
    registrationDeadline: null,
    maxTicketsPerRegistration: null,
    participantRegistrationEnabled: false,
    participantLabel: null,
    participantDescription: null,
    participantPrice: null,
    participantCapacity: null,
    participantRegisteredCount: 0,
    participantRegistrationStart: null,
    participantRegistrationDeadline: null,
    participantMaxTicketsPerRegistration: null,
    ratingMode: "COMPETITIVE",
    audioRecordingEnabled: true,
    audioRecordingAppliesTo: "PARTICIPANT",
  };
}

// Live preview for the event editor: overlays the unsaved draft onto the
// event's saved EventDetail row, so adaptApiEvent() can render it with the
// exact same fallbacks the public page uses. Registered/interested counts
// and other server-owned columns stay as saved.
export function draftToPreviewDetail(
  base: EventDetail,
  data: EventDetailData,
): EventDetail {
  const start = toIsoTimestamp(data.date, data.time) ?? null;
  // The draft has no end date — keep the saved event's length and move it
  // with the start, so a multi-day event stays multi-day in the preview.
  let end = base.endDate;
  if (start && base.startDate && base.endDate) {
    const span =
      new Date(base.endDate).getTime() - new Date(base.startDate).getTime();
    end = new Date(new Date(start).getTime() + span).toISOString();
  } else if (!start) {
    end = null;
  }
  const participant = data.participantRegistrationEnabled;
  const isoOrNull = (date: string) =>
    date ? (toIsoTimestamp(date) ?? null) : null;
  return {
    ...base,
    title: data.title,
    eventTypeId: data.type ?? base.eventTypeId,
    modeOfEventId: data.mode,
    summary: data.summary.trim() || null,
    description: data.description || null,
    startDate: start,
    endDate: end,
    city: data.city,
    address: data.location || null,
    participationLink: data.participationLink || null,
    maxAttendees: data.capacity || null,
    ticketPrice: data.priceAmount,
    coverImageUrl: data.coverImageUrl || null,
    // A local preview shows as-is; the save uploads it.
    cardImageUrl: data.cardImageUrl || null,
    registrationStart: isoOrNull(data.attendeeRegistrationOpens),
    registrationDeadline: isoOrNull(data.attendeeRegistrationCloses),
    participantRegistrationStart: participant
      ? isoOrNull(data.participantRegistrationOpens)
      : null,
    participantRegistrationDeadline: participant
      ? isoOrNull(data.participantRegistrationCloses)
      : null,
    terms: data.terms.trim() || null,
    eligibility: data.eligibility.trim() || null,
    durationText: data.duration.trim() || null,
    // Preview only — the draft's stages, whatever was saved (null = none).
    stagesJson: stagesJson(data) ?? null,
    certificateOffered: data.certificate,
    attendeeLabel: data.attendeeLabel.trim() || null,
    attendeeDescription: data.attendeeDescription.trim() || null,
    attendeeRegistrationEnabled: data.attendeeRegistrationEnabled,
    maxTicketsPerRegistration: data.attendeeMaxTicketsPerRegistration || null,
    participantRegistrationEnabled: participant,
    participantLabel: data.participantLabel.trim() || null,
    participantDescription: data.participantDescription.trim() || null,
    participantPrice: data.participantPriceAmount,
    participantCapacity: data.participantCapacity || null,
    participantMaxTicketsPerRegistration:
      data.participantMaxTicketsPerRegistration || null,
  };
}

// Raw event detail + timeline -> wizard EventDetailData (with FK ids
// intact), for prefilling the edit wizard.
export function toEventDraft(
  detail: EventDetail,
  timeline: EventTimelineEntry[] = [],
  rounds: EventRoundDto[] = [],
  questions: EventQuestionDto[] = [],
  socialLinks: { platform: string; url: string }[] = [],
  media: { url: string }[] = [],
  faqs: { question: string; answer: string }[] = [],
  partners: EventPartnerItem[] = [],
): EventDetailData {
  const istDateOrBlank = (iso: string | null) => (iso ? istDate(iso) : "");
  return {
    id: detail.id,
    type: detail.eventTypeId,
    title: detail.title,
    summary: detail.summary ?? "",
    description: detail.description ?? "",
    priceAmount: detail.ticketPrice ?? 0,
    capacity: detail.maxAttendees ?? 0,
    attendeeMaxTicketsPerRegistration: detail.maxTicketsPerRegistration ?? 0,
    participantMaxTicketsPerRegistration:
      detail.participantMaxTicketsPerRegistration ?? 0,
    attendeeLabel: detail.attendeeLabel ?? "",
    attendeeDescription: detail.attendeeDescription ?? "",
    attendeeRegistrationEnabled: detail.attendeeRegistrationEnabled,
    participantRegistrationEnabled: detail.participantRegistrationEnabled,
    participantLabel: detail.participantLabel ?? "",
    participantDescription: detail.participantDescription ?? "",
    participantPriceAmount: detail.participantPrice ?? 0,
    participantCapacity: detail.participantCapacity ?? 0,
    categoryIds: detail.categoryIds,
    terms: detail.terms ?? "",
    eligibility: detail.eligibility ?? "",
    mode: detail.modeOfEventId,
    date: istDateOrBlank(detail.startDate),
    time: detail.startDate ? istTime(detail.startDate) : "",
    location: detail.address ?? "",
    city: detail.city ?? "",
    participationLink: detail.participationLink ?? "",
    attendeeRegistrationOpens: istDateOrBlank(detail.registrationStart),
    attendeeRegistrationCloses: istDateOrBlank(detail.registrationDeadline),
    participantRegistrationOpens: istDateOrBlank(
      detail.participantRegistrationStart,
    ),
    participantRegistrationCloses: istDateOrBlank(
      detail.participantRegistrationDeadline,
    ),
    duration: detail.durationText ?? "",
    coverImageUrl: resolveImageUrl(detail.coverImageUrl) ?? "",
    cardImageUrl: resolveImageUrl(detail.cardImageUrl) ?? "",
    mediaUrls:
      media.length > 0
        ? media.map((m) => m.url)
        : detail.bannerImageUrl
          ? [detail.bannerImageUrl]
          : [],
    socialLinks: socialLinks.map(({ platform, url }) => ({ platform, url })),
    stages: parseStages(detail.stagesJson),
    faqs: faqs.map(({ question, answer }) => ({ question, answer })),
    partners: partners.map((p) => ({
      name: p.name,
      role: p.role,
      logoUrl: p.logoUrl ?? "",
      url: p.url ?? "",
      about: p.about ?? "",
    })),
    timeline: timeline.map((row) => {
      const item = adaptTimelineItem(row);
      return {
        date: item.date,
        time: item.time,
        endTime: item.endTime ?? "",
        title: item.title,
        description: item.description,
        location: item.location ?? "",
        dayLabel: item.dayLabel ?? "",
      };
    }),
    rounds: rounds.map((row) => {
      const item = adaptEventRound(row);
      return {
        id: row.id,
        name: item.name,
        description: item.description,
        mode: row.mode,
        rubric: item.rubric.map((c) => ({
          id: Number(c.id),
          label: c.label,
          maxScore: c.maxScore,
        })),
        shortlistCount: item.shortlistCount ?? 0,
        date: item.startTime ? istDate(item.startTime) : "",
        startTime: item.startTime ? istTime(item.startTime) : "",
        endTime: item.endTime ? istTime(item.endTime) : "",
        judgeWeight: item.judgeWeight,
        audienceWeight: item.audienceWeight,
        judgeScoringEnabled: item.judgeScoringEnabled,
        audienceScoringEnabled: item.audienceScoringEnabled,
      };
    }),
    certificate: detail.certificateOffered,
    audioRecordingEnabled: detail.audioRecordingEnabled,
    audioRecordingAppliesTo: detail.audioRecordingAppliesTo,
    questions: questions.map((row) => {
      const q = adaptEventQuestion(row);
      return {
        id: Number(q.id),
        prompt: q.prompt,
        type: q.type,
        required: q.required,
        allowOther: q.allowOther,
        appliesTo: q.appliesTo,
        options: q.options.map((o) => ({
          id: Number(o.id),
          settingId: null,
          label: o.label,
          advancedOptions: o.advancedOptions.map((a) => ({
            id: Number(a.id),
            settingId: null,
            label: a.label,
            advancedOptions: [],
            advancedEnabled: false,
            advancedRequired: false,
          })),
          advancedEnabled: o.advancedEnabled,
          advancedRequired: o.advancedRequired,
        })),
      };
    }),
    advancedAdditionalQuestionsEnabled: false,
  };
}
