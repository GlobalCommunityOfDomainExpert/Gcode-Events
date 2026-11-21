// Event rows → the UI's Event model.

import {
  Event,
  EventTimelineItem,
  RegistrationCategory,
  EventStage,
} from "@/lib/event";
import { EventStageData } from "@/lib/zod/event";
import type {
  EventDetail,
  EventSummary,
  EventTimelineEntry,
} from "@/server/modules/events/events.schemas";
import type { EventQuestion as EventQuestionDto } from "@/server/modules/questions/questions.schemas";
import type { StageJson } from "@/lib/event-draft/payloads";
import {
  resolveEventType,
  resolveMode,
  resolveRatingMode,
  resolveStatus,
} from "./codes";
import {
  formatDate,
  formatDuration,
  formatTime,
  resolveImageUrl,
  resolveLocation,
  splitBullets,
} from "./format";
import { istDate, istTime } from "@/lib/datetime/ist";
import { adaptEventQuestion } from "./questions";

// Shown when an organizer hasn't set custom terms/eligibility for an event.
export const DEFAULT_TERMS = [
  "Registration confirms your agreement to attend and follow the event's code of conduct.",
  "GCODE reserves the right to modify event details or cancel the event due to unforeseen circumstances.",
  "No refunds for paid tickets unless the event is cancelled by the organizer.",
];

export const DEFAULT_ELIGIBILITY = [
  "Open to all professionals, students, and enthusiasts interested in the topic.",
  "Participants must be 18 years or older, or attend with a guardian.",
];

// Timeline entry -> UI timeline item. Splits the ISO start/end into the
// date + time fields the UI uses.
export function adaptTimelineItem(row: EventTimelineEntry): EventTimelineItem {
  return {
    date: row.startTime ? istDate(row.startTime) : "",
    time: row.startTime ? istTime(row.startTime) : "",
    endTime: row.endTime ? istTime(row.endTime) : undefined,
    title: row.title,
    description: row.description ?? "",
    location: row.location ?? undefined,
    dayLabel: row.dayLabel?.trim() || undefined,
  };
}

export function isEventDetail(
  event: EventSummary | EventDetail,
): event is EventDetail {
  return "registrationDeadline" in event;
}

// STAGES_JSON <-> wizard stages. Blank labels fall back to "Day N" so a
// stage is never nameless.
export function parseStages(raw: string | null | undefined): EventStageData[] {
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw) as Partial<StageJson>[];
    if (!Array.isArray(rows)) return [];
    return rows.map((r, i) => ({
      label: r.label?.trim() || `Day ${i + 1}`,
      date: r.date ?? "",
      endDate: r.end_date ?? "",
      time: r.time ?? "",
      mode: r.mode === "OFFLINE" || r.mode === "BOTH" ? r.mode : "ONLINE",
      link: r.link ?? "",
      venue: r.venue ?? "",
      cta: r.cta === "SUBMIT" || r.cta === "LINK" ? r.cta : "AUTO",
      ctaLabel: r.cta_label ?? "",
      ctaUrl: r.cta_url ?? "",
    }));
  } catch {
    return [];
  }
}

// Maps an event (list row or full detail) onto the UI's Event shape — see
// src/lib/event.ts for which fields are backed by real columns vs.
// placeholders. List rows leave the detail-only fields at their defaults.
export function adaptApiEvent(
  event: EventSummary | EventDetail,
  eventTypeNames: Record<number, string>,
  modeNames: Record<number, string>,
  statusCodes: Record<number, string>,
  questions: EventQuestionDto[] = [],
): Event {
  const detail = isEventDetail(event) ? event : undefined;
  const price = event.ticketPrice === 0 ? "Free" : `₹${event.ticketPrice}`;
  const spotsLeft =
    event.maxAttendees != null
      ? Math.max(event.maxAttendees - event.registeredCount, 0)
      : undefined;
  const registrationCloses = detail?.registrationDeadline
    ? formatDate(detail.registrationDeadline)
    : formatDate(event.startDate);

  const attendeeRegistration: RegistrationCategory = {
    // List rows don't carry the flag; attendees default to open.
    enabled: detail?.attendeeRegistrationEnabled ?? true,
    label: detail?.attendeeLabel || "Attendee",
    description: detail?.attendeeDescription || "",
    price: event.ticketPrice,
    priceLabel: price,
    capacity: event.maxAttendees ?? undefined,
    registeredCount: event.registeredCount,
    spotsLeft,
    maxTicketsPerRegistration: detail?.maxTicketsPerRegistration ?? undefined,
    registrationCloses,
    registrationDeadlineIso: detail?.registrationDeadline ?? null,
    registrationOpensIso: detail?.registrationStart ?? null,
  };

  const participantPrice = detail?.participantPrice ?? 0;
  const participantRegistered = detail?.participantRegisteredCount ?? 0;
  const participantRegistration: RegistrationCategory = {
    enabled: detail?.participantRegistrationEnabled ?? false,
    label: detail?.participantLabel || "Participant",
    description: detail?.participantDescription || "",
    price: participantPrice,
    priceLabel: participantPrice === 0 ? "Free" : `₹${participantPrice}`,
    capacity: detail?.participantCapacity ?? undefined,
    registeredCount: participantRegistered,
    spotsLeft:
      detail?.participantCapacity != null
        ? Math.max(detail.participantCapacity - participantRegistered, 0)
        : undefined,
    maxTicketsPerRegistration:
      detail?.participantMaxTicketsPerRegistration ?? undefined,
    registrationCloses: detail?.participantRegistrationDeadline
      ? formatDate(detail.participantRegistrationDeadline)
      : formatDate(event.startDate),
    registrationDeadlineIso: detail?.participantRegistrationDeadline ?? null,
    registrationOpensIso: detail?.participantRegistrationStart ?? null,
  };

  return {
    id: String(event.id),
    title: event.title,
    type: resolveEventType(eventTypeNames[event.eventTypeId]),
    mode: resolveMode(modeNames[event.modeOfEventId]),
    status: resolveStatus(statusCodes[event.statusId]),
    price,
    priceAmount: event.ticketPrice || undefined,
    date: formatDate(event.startDate),
    time: formatTime(event.startDate),
    location: resolveLocation(event.city ?? "", event.address),
    registeredCount: event.registeredCount,
    interestedCount: detail?.interestedCount ?? 0,
    capacity: event.maxAttendees ?? undefined,
    spotsLeft,
    attendeeRegistration,
    participantRegistration,
    ratingMode: resolveRatingMode(detail?.ratingMode),
    audioRecordingEnabled: detail?.audioRecordingEnabled ?? true,
    audioRecordingAppliesTo: detail?.audioRecordingAppliesTo ?? "PARTICIPANT",
    advancedAdditionalQuestionsEnabled: false,
    questions: questions.map(adaptEventQuestion),
    featured: event.isFeatured,
    maxTicketsPerRegistration: detail?.maxTicketsPerRegistration ?? undefined,
    is_featured: event.isFeatured,
    registrationCloses,
    registrationDeadlineIso: detail?.registrationDeadline ?? null,
    duration: formatDuration(event.startDate, event.endDate),
    endDateIso: event.endDate ?? event.startDate ?? null,
    startDateIso: event.startDate ?? null,
    summary: detail?.summary || undefined,
    durationText: detail?.durationText ?? undefined,
    // No team-size columns yet — default to individual attendance.
    teamSize: "Individual",
    certificate: false,
    description: detail?.description
      ? detail.description.split("\n").filter((line) => line.trim() !== "")
      : [],
    timeline: [],
    stages: parseStages(detail?.stagesJson).map((s): EventStage => ({
      label: s.label,
      date: s.date,
      endDate: s.date && s.endDate > s.date ? s.endDate : undefined,
      time: s.time,
      mode:
        s.mode === "ONLINE"
          ? "Online"
          : s.mode === "BOTH"
            ? "Both"
            : "In-Person",
      link: s.mode !== "OFFLINE" ? s.link || undefined : undefined,
      venue: s.mode !== "ONLINE" ? s.venue || undefined : undefined,
      // A custom link needs both parts; half-filled falls back to auto.
      cta:
        s.cta === "SUBMIT"
          ? "submit"
          : s.cta === "LINK" && s.ctaUrl
            ? "link"
            : "auto",
      ctaLabel: s.ctaLabel || undefined,
      ctaUrl: s.ctaUrl || undefined,
    })),
    rounds: [],
    organizerId: detail?.organizerId ?? undefined,
    organizer: {
      name: detail?.organizerName || detail?.createdBy || "GCODE Team",
      title: "Organizer",
      verified: false,
      eventsHosted: 0,
      attendees: 0,
    },
    terms: splitBullets(detail?.terms ?? null, DEFAULT_TERMS),
    eligibility: splitBullets(detail?.eligibility ?? null, DEFAULT_ELIGIBILITY),
    tags: detail?.categoryNames.length ? detail.categoryNames : undefined,
    coverImageUrl: resolveImageUrl(event.coverImageUrl),
    cardImageUrl: resolveImageUrl(event.cardImageUrl),
    mediaUrls: event.bannerImageUrl ? [event.bannerImageUrl] : [],
    participationLink: event.participationLink ?? undefined,
  };
}
