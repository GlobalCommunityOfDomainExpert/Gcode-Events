import {
  EventType,
  EventStatus,
  Event,
  EventTimelineItem,
  EventRound,
  EventPanelist,
  Coupon,
  UpiClaim,
  MyTicket,
  RegistrationCategory,
} from "@/lib/event";
import { RoundDecision, RoundScore } from "@/lib/rounds";
import { EventDetailData } from "@/lib/zod/event";
import { EventTimelineApi } from "./events";
import { Attendee, AttendeeRole } from "@/lib/attendees";
import {
  EventDetail,
  EventListItem,
  CreateEventPayload,
  ParticipantApi,
  MyParticipationApi,
  EventRoundApi,
  EventRoundRubricApi,
  RoundDecisionApi,
  RoundScoreApi,
  EventPanelistApi,
  PanelistInviteApi,
  CouponApi,
  UpiClaimApi,
} from "./types";
import { API_BASE_URL } from "./client";

// Cover/banner URLs may be stored as an API-relative path (DB-hosted image) or
// an absolute URL. Resolve relative ones against the API base.
export function resolveImageUrl(url: string | null): string | undefined {
  if (!url) return undefined;
  return url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
}

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

// Organizer text is stored newline-separated (like DESCRIPTION); split into
// bullet lines, falling back to the defaults above when blank/unset.
function splitBullets(raw: string | null, fallback: string[]): string[] {
  if (!raw) return fallback;
  const lines = raw.split("\n").filter((line) => line.trim() !== "");
  return lines.length > 0 ? lines : fallback;
}

// EVENT_TIMELINE row -> UI timeline item. Splits the ISO start/end into the
// date + time fields the UI uses.
export function adaptTimelineItem(row: EventTimelineApi): EventTimelineItem {
  return {
    date: row.start_time ? istDate(row.start_time) : "",
    time: row.start_time ? istTime(row.start_time) : "",
    endTime: row.end_time ? istTime(row.end_time) : undefined,
    title: row.title,
    description: row.description ?? "",
    location: row.location ?? undefined,
  };
}

// The /events/:id/rounds ORDS handler is a raw SQL Collection Query — its
// JSON_ARRAYAGG(...RETURNING CLOB) "rubric" column comes back as an escaped
// JSON *string*, not a nested array, confirmed live against event 81
// (2026-07-27). Parse defensively rather than assume the shape.
function parseRubric(rubric: EventRoundApi["rubric"]): EventRoundRubricApi[] {
  if (Array.isArray(rubric)) return rubric;
  if (typeof rubric === "string") {
    try {
      const parsed = JSON.parse(rubric);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// GCODE_EVENT_ROUNDS row -> UI round item.
export function adaptEventRound(row: EventRoundApi): EventRound {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description ?? "",
    mode: resolveRoundMode(row.mode),
    rubric: parseRubric(row.rubric).map((r) => ({
      id: String(r.id),
      label: r.label,
      maxScore: r.max_score,
    })),
    shortlistCount: row.shortlist_count ?? 0,
    startTime: row.start_time,
    endTime: row.end_time,
    sortOrder: row.sort_order,
    judgeWeight: row.judge_weight ?? 70,
    audienceWeight: row.audience_weight ?? 30,
    judgeScoringEnabled: row.judge_scoring_enabled === "Y",
    audienceScoringEnabled: row.audience_scoring_enabled === "Y",
  };
}

// GCODE_EVENT_ROUND_DECISIONS row -> UI decision item.
export function adaptRoundDecision(row: RoundDecisionApi): RoundDecision {
  return {
    id: String(row.id),
    roundId: String(row.round_id),
    participantId: String(row.participant_id),
    status: row.status,
    decidedOn: row.decided_on,
  };
}

// GCODE_EVENT_ROUND_SCORES row -> UI score item.
export function adaptRoundScore(row: RoundScoreApi): RoundScore {
  return {
    id: String(row.id),
    roundId: String(row.round_id),
    participantId: String(row.participant_id),
    criterionId: String(row.criterion_id),
    score: row.score,
    scoredBy: row.scored_by ?? "",
    scoredOn: row.scored_on,
  };
}

// GCODE_EVENT_PANELISTS row -> UI panelist item (organizer's list view).
export function adaptEventPanelist(row: EventPanelistApi): EventPanelist {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    userId: row.user_id != null ? String(row.user_id) : undefined,
    invitedEmail: row.invited_email,
    status: row.status,
    invitedOn: row.invited_on,
    respondedOn: row.responded_on,
  };
}

// GCODE_COUPONS row -> UI coupon item (organizer's list view).
export function adaptCoupon(row: CouponApi): Coupon {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    code: row.code,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    maxRedemptions: row.max_redemptions ?? undefined,
    redemptionCount: row.redemption_count,
    validFrom: row.valid_from ?? undefined,
    validTo: row.valid_to ?? undefined,
    isActive: row.is_active === 1,
    createdOn: row.created_on,
    computedStatus: row.computed_status,
  };
}

// GCODE_UPI_PAYMENT_CLAIMS row -> UI claim item (organizer's review queue).
export function adaptUpiClaim(row: UpiClaimApi): UpiClaim {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    email: row.email,
    fullName: row.full_name,
    utr: row.utr,
    amountClaimed: row.amount_claimed,
    status: row.status,
    submittedOn: row.submitted_on,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedOn: row.reviewed_on ?? undefined,
    participantId:
      row.participant_id != null ? String(row.participant_id) : undefined,
  };
}

// Single-invite lookup for the invitee's own accept/decline page.
export interface PanelistInvite {
  id: string;
  eventId: string;
  eventTitle: string;
  invitedEmail: string;
  status: "INVITED" | "ACCEPTED" | "DECLINED";
  invitedOn: string;
}

export function adaptPanelistInvite(row: PanelistInviteApi): PanelistInvite {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    eventTitle: row.event_title,
    invitedEmail: row.invited_email,
    status: row.status,
    invitedOn: row.invited_on,
  };
}

const ROLE_NAME_MAP: Record<string, AttendeeRole> = {
  FRESHER: "Fresher",
  STARTUP: "Startup Founder",
  EXPERT: "Domain Expert",
  INSTITUTION: "Institution",
};

// "Jane Doe" -> "JD". Guest registrants only ever give a full name, no
// avatar image, so initials are all we can show.
function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

// GCODE_EVENT_PARTICIPANTS row -> UI Attendee. Status collapses to
// "registered" for now — the participants table has no attended/no-show
// tracking yet. ticketType/amountPaid are priced off whichever category this
// row registered under (row.category missing/undefined -> treated as
// Attendee, for rows from a backend that hasn't added the column yet).
export function adaptParticipant(
  row: ParticipantApi,
  prices: { attendee: number; participant: number },
): Attendee {
  const isParticipant = row.category === "PARTICIPANT";
  const price = isParticipant ? prices.participant : prices.attendee;
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    name: row.user_name,
    email: row.email ?? "",
    phone: row.phone,
    avatarInitials: initialsOf(row.user_name),
    role: (row.role_name && ROLE_NAME_MAP[row.role_name]) || "Guest",
    ticketType: price > 0 ? "Paid" : "Free",
    quantity: row.quantity,
    amountPaid: price > 0 ? price * row.quantity : undefined,
    status: "registered",
    registeredAt: row.applied_on,
    category: isParticipant ? "Participant" : "Attendee",
    audioSubmissionUrl: row.audio_submission_url,
    audioSubmittedOn: row.audio_submitted_on,
    ageCategory: row.age_category,
  };
}

// Combine the wizard's separate date ("2026-08-01") + time ("14:30") inputs
// into one ISO timestamp for the DB. Missing time -> midnight.
// Wall-clock date+time typed by the user is IST -> stamp with +05:30 so the
// stored instant is correct.
function toIsoTimestamp(date: string, time?: string): string | undefined {
  if (!date) return undefined;
  return `${date}T${time && time !== "" ? time : "00:00"}:00+05:30`;
}

// Maps the wizard's EventDetailData onto the ORDS create payload. Only fields
// with a real backing column are sent; timeline/cover-upload handled separately.
export function toCreatePayload(
  data: EventDetailData,
  createdBy?: string,
  organizerId?: string,
): CreateEventPayload {
  if (data.type === null) {
    throw new Error("Event type is required before creating an event");
  }
  return {
    title: data.title,
    event_type_id: data.type,
    mode_of_event_id: data.mode,
    description: data.description || undefined,
    // null (not undefined) when blank — an omitted key gets dropped by
    // JSON.stringify and the PUT handler leaves the existing column alone,
    // so clearing a previously-set date/time back to "TBD" needs an
    // explicit null to actually reach the backend.
    start_date: toIsoTimestamp(data.date, data.time) ?? null,
    registration_start: data.attendeeRegistrationOpens
      ? toIsoTimestamp(data.attendeeRegistrationOpens)
      : undefined,
    registration_deadline: data.attendeeRegistrationCloses
      ? toIsoTimestamp(data.attendeeRegistrationCloses)
      : undefined,
    participant_registration_start:
      data.participantRegistrationEnabled && data.participantRegistrationOpens
        ? toIsoTimestamp(data.participantRegistrationOpens)
        : undefined,
    participant_registration_deadline:
      data.participantRegistrationEnabled && data.participantRegistrationCloses
        ? toIsoTimestamp(data.participantRegistrationCloses)
        : undefined,
    city: data.city || undefined,
    venue_address: data.location || undefined,
    participation_link: data.participationLink || undefined,
    max_attendees: data.capacity || undefined,
    ticket_price: data.priceAmount,
    certificate_offered: data.certificate ? 1 : 0,
    created_by: createdBy,
    organizer_id: organizerId,
    max_tickets_per_registration:
      data.attendeeMaxTicketsPerRegistration || undefined,
    participant_max_tickets_per_registration:
      data.participantRegistrationEnabled
        ? data.participantMaxTicketsPerRegistration || undefined
        : undefined,
    terms: data.terms.trim() || undefined,
    eligibility: data.eligibility.trim() || undefined,
    duration_text: data.duration.trim() || undefined,
    attendee_label: data.attendeeLabel.trim() || undefined,
    attendee_description: data.attendeeDescription.trim() || undefined,
    attendee_registration_enabled: data.attendeeRegistrationEnabled ? 1 : 0,
    participant_registration_enabled: data.participantRegistrationEnabled
      ? 1
      : 0,
    participant_price: data.participantRegistrationEnabled
      ? data.participantPriceAmount
      : undefined,
    participant_capacity: data.participantRegistrationEnabled
      ? data.participantCapacity || undefined
      : undefined,
    participant_label: data.participantRegistrationEnabled
      ? data.participantLabel.trim() || undefined
      : undefined,
    participant_description: data.participantRegistrationEnabled
      ? data.participantDescription.trim() || undefined
      : undefined,
    audio_recording_enabled: data.audioRecordingEnabled ? 1 : 0,
    age_category_requirement: data.ageCategoryRequirement,
    track_submission_enabled: data.trackSubmissionEnabled ? 1 : 0,
    member_names_enabled: data.memberNamesEnabled ? 1 : 0,
  };
}

// JSON_ARRAYAGG columns arrive as a JSON-array-shaped string (or null when
// the event has no categories) rather than a real array.
function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

// Raw event detail + timeline -> wizard EventDetailData (with FK ids
// intact), for prefilling the edit wizard.
export function toEventDraft(
  detail: EventDetail,
  timeline: EventTimelineApi[] = [],
  rounds: EventRoundApi[] = [],
): EventDetailData {
  return {
    id: detail.id,
    type: detail.event_type_id,
    title: detail.event_name,
    description: detail.description ?? "",
    priceAmount: detail.ticket_price ?? 0,
    capacity: detail.max_attendees ?? 0,
    attendeeMaxTicketsPerRegistration: detail.max_tickets_per_registration ?? 0,
    participantMaxTicketsPerRegistration:
      detail.participant_max_tickets_per_registration ?? 0,
    attendeeLabel: detail.attendee_label ?? "",
    attendeeDescription: detail.attendee_description ?? "",
    attendeeRegistrationEnabled: detail.attendee_registration_enabled !== 0,
    participantRegistrationEnabled:
      detail.participant_registration_enabled === 1,
    participantLabel: detail.participant_label ?? "",
    participantDescription: detail.participant_description ?? "",
    participantPriceAmount: detail.participant_price ?? 0,
    participantCapacity: detail.participant_capacity ?? 0,
    categoryIds: parseJsonArray<number>(detail.category_ids),
    terms: detail.terms ?? "",
    eligibility: detail.eligibility ?? "",
    mode: detail.mode_of_event_id,
    date: detail.start_date ? istDate(detail.start_date) : "",
    time: detail.start_date ? istTime(detail.start_date) : "",
    location: detail.address ?? "",
    city: detail.city ?? "",
    participationLink: detail.participation_link ?? "",
    attendeeRegistrationOpens: detail.registration_start
      ? istDate(detail.registration_start)
      : "",
    attendeeRegistrationCloses: detail.registration_deadline
      ? istDate(detail.registration_deadline)
      : "",
    participantRegistrationOpens: detail.participant_registration_start
      ? istDate(detail.participant_registration_start)
      : "",
    participantRegistrationCloses: detail.participant_registration_deadline
      ? istDate(detail.participant_registration_deadline)
      : "",
    duration: detail.duration_text ?? "",
    coverImageUrl: resolveImageUrl(detail.cover_image_url) ?? "",
    mediaUrls: detail.banner_image_url ? [detail.banner_image_url] : [],
    socialLinks: [],
    timeline: timeline.map((row) => {
      const item = adaptTimelineItem(row);
      return {
        date: item.date,
        time: item.time,
        endTime: item.endTime ?? "",
        title: item.title,
        description: item.description,
        location: item.location ?? "",
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
    certificate: Number(detail.certificate_offered) === 1,
    audioRecordingEnabled: Number(detail.audio_recording_enabled) !== 0,
    ageCategoryRequirement: resolveAgeCategoryRequirement(
      detail.age_category_requirement,
    ),
    trackSubmissionEnabled: Number(detail.track_submission_enabled) === 1,
    memberNamesEnabled: Number(detail.member_names_enabled) === 1,
  };
}

export interface TimelinePayloadItem {
  title: string;
  description: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  sortOrder: number;
}

// Wizard timeline items -> EVENT_TIMELINE rows. Each item's own date + time
// become an ISO timestamp. No date on the item itself -> real NULL (not a
// placeholder, and NOT the event's own date either — an item with times
// hidden must stay genuinely timeless even though the event has a date).
export function toTimelinePayload(
  data: EventDetailData,
): TimelinePayloadItem[] {
  return data.timeline
    .filter((item) => item.title.trim() !== "")
    .map((item, index) => {
      const day = item.date || null;
      return {
        title: item.title,
        description: item.description,
        startTime: day ? (toIsoTimestamp(day, item.time) ?? null) : null,
        endTime:
          item.endTime && day
            ? (toIsoTimestamp(day, item.endTime) ?? null)
            : null,
        location: item.location || null,
        sortOrder: index,
      };
    });
}

export interface RoundRubricPayloadItem {
  // Existing GCODE_EVENT_ROUND_RUBRICS.ID, null for a new criterion — lets
  // the backend UPDATE in place instead of delete+reinsert (see
  // eventRoundRubricCriterionSchema in lib/zod/event.ts for why).
  id: number | null;
  label: string;
  maxScore: number;
}

export interface RoundPayloadItem {
  // Existing GCODE_EVENT_ROUNDS.ID, null for a new round — same
  // update-in-place reasoning as the rubric id above.
  id: number | null;
  name: string;
  description: string;
  mode: "ONLINE" | "OFFLINE";
  rubric: RoundRubricPayloadItem[];
  shortlistCount: number;
  startTime: string | null;
  endTime: string | null;
  sortOrder: number;
  judgeWeight: number;
  audienceWeight: number;
  // 'Y'/'N' to match the CHAR(1) column convention on the wire — see
  // EventRoundApi.judge_scoring_enabled in types.ts.
  judgeScoringEnabled: "Y" | "N";
  audienceScoringEnabled: "Y" | "N";
}

// Wizard round items -> GCODE_EVENT_ROUNDS rows. Mirrors toTimelinePayload's
// date+time -> ISO combining and blank-title filtering.
export function toRoundsPayload(data: EventDetailData): RoundPayloadItem[] {
  return data.rounds
    .filter((item) => item.name.trim() !== "")
    .map((item, index) => {
      const day = item.date || null;
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        mode: item.mode,
        rubric: item.rubric
          .filter((c) => c.label.trim() !== "")
          .map((c) => ({ id: c.id, label: c.label, maxScore: c.maxScore })),
        shortlistCount: item.shortlistCount,
        startTime: day ? (toIsoTimestamp(day, item.startTime) ?? null) : null,
        endTime:
          item.endTime && day
            ? (toIsoTimestamp(day, item.endTime) ?? null)
            : null,
        sortOrder: index,
        judgeWeight: item.judgeWeight,
        audienceWeight: item.audienceWeight,
        judgeScoringEnabled: item.judgeScoringEnabled ? "Y" : "N",
        audienceScoringEnabled: item.audienceScoringEnabled ? "Y" : "N",
      };
    });
}

const MODE_NAME_MAP: Record<string, Event["mode"]> = {
  PHYSICAL: "In-Person",
  ONLINE: "Online",
  HYBRID: "Hybrid",
};

const KNOWN_EVENT_STATUSES: EventStatus[] = [
  "DRAFT",
  "APPROVAL_PENDING",
  "OPEN",
  "REGISTRATION_CLOSED",
  "ONGOING",
  "COMPLETED",
  "CANCELLED",
];

function resolveEventType(name: string | undefined): EventType {
  return name ?? "Other";
}

function resolveMode(name: string | undefined): Event["mode"] {
  return (name && MODE_NAME_MAP[name]) || "Online";
}

function resolveStatus(code: string | undefined): EventStatus | undefined {
  return KNOWN_EVENT_STATUSES.find((s) => s === code);
}

function resolveRatingMode(
  mode: "COMPETITIVE" | "CASUAL" | undefined,
): Event["ratingMode"] {
  return mode === "CASUAL" ? "Casual" : "Competitive";
}

function resolveAgeCategoryRequirement(
  value: "OFF" | "OPTIONAL" | "REQUIRED" | undefined,
): Event["ageCategoryRequirement"] {
  return value === "OFF" || value === "REQUIRED" ? value : "OPTIONAL";
}

function resolveRoundMode(
  mode: "ONLINE" | "OFFLINE" | undefined,
): EventRound["mode"] {
  return mode === "ONLINE" ? "Online" : "Offline";
}

// All event times are IST (Asia/Kolkata). Wall-clock input is interpreted as
// IST; display + prefill convert back to IST.
const IST = "Asia/Kolkata";

// ISO date "yyyy-mm-dd" of an instant, in IST.
function istDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// 24h "HH:MM" of an instant, in IST.
function istTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatDate(iso: string | null): string {
  if (!iso) return "Coming Soon";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: IST,
  }).format(new Date(iso));
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return `${new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: IST,
  }).format(new Date(iso))} IST`;
}

function resolveLocation(city: string, address: string | null): string {
  if (address && address !== "TBD") return `${address}, ${city}`;
  return city;
}

// Human duration between two ISO timestamps, e.g. "3h 30m", "2 days".
export function formatDuration(
  start: string | null,
  end: string | null,
): string {
  if (!start || !end) return "";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const mins = Math.round(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  if (days > 0)
    return `${days} day${days > 1 ? "s" : ""}${hours ? ` ${hours}h` : ""}`;
  if (hours > 0) return `${hours}h${rem ? ` ${rem}m` : ""}`;
  return `${rem}m`;
}

// Maps a GCODE_Events_API event onto the UI's Event shape — see event.ts
// for which fields are backed by real columns vs. hardcoded placeholders.
export function adaptApiEvent(
  event: EventListItem | EventDetail,
  eventTypeNames: Record<number, string>,
  modeNames: Record<number, string>,
  statusCodes: Record<number, string>,
): Event {
  const detail = "description" in event ? event : undefined;
  const price = event.ticket_price === 0 ? "Free" : `₹${event.ticket_price}`;

  // Missing/undefined attendee_registration_enabled -> treated as enabled
  // (matches today's implicit always-on behavior on a backend that hasn't
  // added the column yet). Missing/undefined participant_registration_enabled
  // -> treated as disabled (the Participant category is opt-in).
  const attendeeRegistration: RegistrationCategory = {
    enabled: detail?.attendee_registration_enabled !== 0,
    label: detail?.attendee_label || "Attendee",
    description: detail?.attendee_description || "",
    price: event.ticket_price,
    priceLabel: price,
    capacity: event.max_attendees ?? undefined,
    registeredCount: event.registered_count,
    spotsLeft:
      event.max_attendees != null
        ? Math.max(event.max_attendees - event.registered_count, 0)
        : undefined,
    maxTicketsPerRegistration:
      detail?.max_tickets_per_registration ?? undefined,
    registrationCloses: detail?.registration_deadline
      ? formatDate(detail.registration_deadline)
      : formatDate(event.start_date),
    registrationDeadlineIso: detail?.registration_deadline ?? null,
    registrationOpensIso: detail?.registration_start ?? null,
  };

  const participantPrice = detail?.participant_price ?? 0;
  const participantRegistration: RegistrationCategory = {
    enabled: detail?.participant_registration_enabled === 1,
    label: detail?.participant_label || "Participant",
    description: detail?.participant_description || "",
    price: participantPrice,
    priceLabel: participantPrice === 0 ? "Free" : `₹${participantPrice}`,
    capacity: detail?.participant_capacity ?? undefined,
    registeredCount: detail?.participant_registered_count ?? 0,
    spotsLeft:
      detail?.participant_capacity != null
        ? Math.max(
            detail.participant_capacity -
              (detail?.participant_registered_count ?? 0),
            0,
          )
        : undefined,
    maxTicketsPerRegistration:
      detail?.participant_max_tickets_per_registration ?? undefined,
    registrationCloses: detail?.participant_registration_deadline
      ? formatDate(detail.participant_registration_deadline)
      : formatDate(event.start_date),
    registrationDeadlineIso: detail?.participant_registration_deadline ?? null,
    registrationOpensIso: detail?.participant_registration_start ?? null,
  };

  return {
    id: String(event.id),
    title: event.event_name,
    type: resolveEventType(eventTypeNames[event.event_type_id]),
    mode: resolveMode(modeNames[event.mode_of_event_id]),
    status: resolveStatus(statusCodes[event.status_id]),
    price,
    priceAmount: event.ticket_price || undefined,
    date: formatDate(event.start_date),
    time: formatTime(event.start_date),
    location: resolveLocation(event.city, event.address),
    registeredCount: event.registered_count,
    // Read off `event` directly, not `detail`: `detail` is inferred from the
    // "description" key, which ORDS omits when it's null — that would zero
    // the count for any event with no description.
    interestedCount: (event as Partial<EventDetail>).interested_count ?? 0,
    capacity: event.max_attendees ?? undefined,
    spotsLeft:
      event.max_attendees != null
        ? Math.max(event.max_attendees - event.registered_count, 0)
        : undefined,
    attendeeRegistration,
    participantRegistration,
    ratingMode: resolveRatingMode(detail?.rating_mode),
    audioRecordingEnabled: detail?.audio_recording_enabled !== 0,
    ageCategoryRequirement: resolveAgeCategoryRequirement(
      detail?.age_category_requirement,
    ),
    trackSubmissionEnabled: detail?.track_submission_enabled === 1,
    memberNamesEnabled: detail?.member_names_enabled === 1,
    featured: event.is_featured === 1,
    maxTicketsPerRegistration:
      detail?.max_tickets_per_registration ?? undefined,
    // ORDS can serialize NUMBER columns as JSON strings depending on config,
    // so this can arrive as "1" rather than 1 — coerce before comparing.
    is_featured: Number(event.is_featured) === 1,
    registrationCloses: detail?.registration_deadline
      ? formatDate(detail.registration_deadline)
      : formatDate(event.start_date),
    registrationDeadlineIso: detail?.registration_deadline ?? null,
    duration: formatDuration(event.start_date, event.end_date),
    endDateIso: event.end_date ?? event.start_date ?? null,
    durationText: detail?.duration_text ?? undefined,
    // No team-size columns yet — default to individual attendance.
    teamSize: "Individual",
    certificate: false,
    description: detail?.description
      ? detail.description.split("\n").filter((line) => line.trim() !== "")
      : [],
    timeline: [],
    rounds: [],
    organizer: {
      name: detail?.organizer_name || detail?.created_by || "GCODE Team",
      title: "Organizer",
      verified: false,
      eventsHosted: 0,
      attendees: 0,
    },
    terms: splitBullets(detail?.terms ?? null, DEFAULT_TERMS),
    eligibility: splitBullets(detail?.eligibility ?? null, DEFAULT_ELIGIBILITY),
    tags: detail?.category_names
      ? parseJsonArray<string>(detail.category_names)
      : undefined,
    coverImageUrl: resolveImageUrl(event.cover_image_url),
    mediaUrls: event.banner_image_url ? [event.banner_image_url] : [],
    participationLink: event.participation_link ?? undefined,
  };
}

// Maps a GCODE_EVENT_PARTICIPANTS_API.list_by_user row (the signed-in user's
// own registration, joined to its event) onto the UI's MyTicket shape.
export function adaptMyParticipation(
  row: MyParticipationApi,
  eventTypeNames: Record<number, string>,
  modeNames: Record<number, string>,
  statusCodes: Record<number, string>,
): MyTicket {
  const isParticipant = row.category === "PARTICIPANT";
  const price = isParticipant ? (row.participant_price ?? 0) : row.ticket_price;
  return {
    participantId: String(row.participant_id),
    eventId: String(row.event_id),
    title: row.event_name,
    type: resolveEventType(eventTypeNames[row.event_type_id]),
    mode: resolveMode(modeNames[row.mode_of_event_id]),
    status: resolveStatus(statusCodes[row.status_id]),
    date: formatDate(row.start_date),
    time: formatTime(row.start_date),
    location: resolveLocation(row.city, row.address),
    coverImageUrl: resolveImageUrl(row.cover_image_url),
    price: price === 0 ? "Free" : `₹${price}`,
    quantity: row.quantity,
    amountPaid: price > 0 ? price * row.quantity : undefined,
    appliedOn: row.applied_on,
    category: isParticipant ? "Participant" : "Attendee",
  };
}
