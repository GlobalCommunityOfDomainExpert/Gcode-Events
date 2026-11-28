import "server-only";
import type {
  EventDetailRow,
  EventSummaryRow,
  TimelineRow,
} from "./events.repository";
import type {
  EventDetail,
  EventSummary,
  EventTimelineEntry,
} from "./events.schemas";
import { BASE_PATH } from "@/lib/base-path";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function jsonArray<T>(value: string | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

// Cover and card images stored in the database are saved as the old ORDS
// paths "/events/:id/cover-image-file" and "/events/:id/card-image-file";
// serve them from our own routes instead (with the base path: these go
// straight into <img src>). Absolute URLs (and anything else)
// pass through untouched.
export function publicImageUrl(url: string | null): string | null {
  if (!url) return null;
  const dbHosted = url.match(/^\/events\/(\d+)\/(cover|card)-image-file$/);
  return dbHosted
    ? `${BASE_PATH}/api/v1/events/${dbHosted[1]}/${dbHosted[2]}-image`
    : url;
}

export function toEventSummary(r: EventSummaryRow): EventSummary {
  return {
    id: r.id,
    title: r.event_name,
    eventTypeId: r.event_type_id,
    modeOfEventId: r.mode_of_event_id,
    statusId: r.status_id,
    city: r.city ?? null,
    address: r.address ?? null,
    startDate: iso(r.start_date),
    endDate: iso(r.end_date),
    maxAttendees: r.max_attendees ?? null,
    ticketPrice: r.ticket_price ?? 0,
    isFeatured: Number(r.is_featured) === 1,
    coverImageUrl: publicImageUrl(r.cover_image_url),
    cardImageUrl: publicImageUrl(r.card_image_url ?? null),
    bannerImageUrl: r.banner_image_url ?? null,
    participationLink: r.participation_link ?? null,
    registeredCount: r.registered_count ?? 0,
  };
}

export function toEventDetail(r: EventDetailRow): EventDetail {
  return {
    ...toEventSummary(r),
    summary: r.summary ?? null,
    description: r.description ?? null,
    durationText: r.duration_text ?? null,
    terms: r.terms ?? null,
    eligibility: r.eligibility ?? null,
    stagesJson: r.stages_json ?? null,
    certificateOffered: Number(r.certificate_offered) === 1,

    organizerId: r.organizer_id ?? null,
    organizerName: r.organizer_name ?? null,
    createdBy: r.created_by ?? null,
    createdOn: iso(r.created_on),
    updatedBy: r.updated_by ?? null,
    updatedOn: iso(r.updated_on),

    categoryIds: jsonArray<number>(r.category_ids),
    categoryNames: jsonArray<string>(r.category_names),
    interestedCount: r.interested_count ?? 0,

    // A NULL column predates the setting: attendees were always on,
    // participants opt-in, audio recording on.
    attendeeRegistrationEnabled: r.attendee_registration_enabled !== 0,
    attendeeLabel: r.attendee_label ?? null,
    attendeeDescription: r.attendee_description ?? null,
    registrationStart: iso(r.registration_start),
    registrationDeadline: iso(r.registration_deadline),
    maxTicketsPerRegistration: r.max_tickets_per_registration ?? null,

    participantRegistrationEnabled: r.participant_registration_enabled === 1,
    participantLabel: r.participant_label ?? null,
    participantDescription: r.participant_description ?? null,
    participantPrice: r.participant_price ?? null,
    participantCapacity: r.participant_capacity ?? null,
    participantRegisteredCount: r.participant_registered_count ?? 0,
    participantRegistrationStart: iso(r.participant_registration_start),
    participantRegistrationDeadline: iso(r.participant_registration_deadline),
    participantMaxTicketsPerRegistration:
      r.participant_max_tickets_per_registration ?? null,

    ratingMode: r.rating_mode === "CASUAL" ? "CASUAL" : "COMPETITIVE",
    audioRecordingEnabled: r.audio_recording_enabled !== 0,
    audioRecordingAppliesTo:
      r.audio_recording_applies_to === "ATTENDEE" ? "ATTENDEE" : "PARTICIPANT",
  };
}

export const toTimelineEntry = (r: TimelineRow): EventTimelineEntry => ({
  title: r.title,
  description: r.description ?? null,
  startTime: iso(r.start_time),
  endTime: iso(r.end_time),
  location: r.location ?? null,
  dayLabel: r.day_label ?? null,
  sortOrder: r.sort_order ?? 0,
});
