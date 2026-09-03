// Event type names come from the backend's EventTypeLookup table, not a
// fixed set — so this is a plain string, not a literal union.
export type EventType = string;

type Tone = "primary" | "success" | "warning" | "danger" | "neutral";

// Styling only known for these names; anything else falls back to neutral.
const KNOWN_EVENT_TYPE_TONE: Record<string, Tone> = {
  Hackathon: "primary",
  "Expert AMA": "warning",
  Webinar: "success",
  Ideathon: "danger",
  "Community Meetup": "neutral",
  Fest: "primary",
  "Charity Event": "success",
};

const KNOWN_EVENT_TYPE_BORDER_CLASS: Record<string, string> = {
  Hackathon: "border-l-primary",
  "Expert AMA": "border-l-warning",
  Webinar: "border-l-success",
  Ideathon: "border-l-danger",
  "Community Meetup": "border-l-border-hover",
  Fest: "border-l-primary",
  "Charity Event": "border-l-success",
};

export function eventTypeTone(type: EventType): Tone {
  return KNOWN_EVENT_TYPE_TONE[type] ?? "neutral";
}

export function eventTypeBorderClass(type: EventType): string {
  return KNOWN_EVENT_TYPE_BORDER_CLASS[type] ?? "border-l-border-hover";
}

export function priceTone(price: string): Tone {
  return price === "Free" ? "success" : "neutral";
}

export function formatDateBadge(date: string): { day: string; month: string } {
  const [day, month] = date.split(" ");
  return { day, month: month.toUpperCase() };
}

// Backed by EVENT_TIMELINE table.
export interface EventTimelineItem {
  date: string; // yyyy-mm-dd
  time: string;
  endTime?: string;
  title: string;
  description: string;
  location?: string;
}

// No backend table for social links yet — adapter never sets this.
export interface EventSocialLink {
  platform: string;
  url: string;
}

// Backed by GCODE_EVENT_ROUND_RUBRICS — contract-only, same as EventRound
// below. One scored criterion within a round's judging rubric (e.g.
// "Creativity" out of 10).
export interface RubricCriterion {
  id: string;
  label: string;
  maxScore: number;
}

// Backed by GCODE_EVENT_ROUNDS. An organizer-configured stage within an
// event (e.g. "Round 1: Audition"), with its own mode.
export interface EventRound {
  id: string;
  name: string;
  description: string;
  mode: "Online" | "Offline";
  rubric: RubricCriterion[];
  // 0/undefined = auto-shortlist disabled for this round.
  shortlistCount?: number;
  startTime?: string | null;
  endTime?: string | null;
  sortOrder: number;
  // Blend weights for this round's live final score (judge rubric average
  // vs audience rating average) — only meaningful for whichever round
  // resolves as "the" live round, see resolveLiveRound in lib/rounds.ts.
  // Only relevant when both scoring toggles below are on for an Offline
  // round; otherwise blendedFinalScore falls back to whichever single
  // source is active regardless of the weight values.
  judgeWeight: number;
  audienceWeight: number;
  // Offline-round-only toggles (Online judge scoring via rubric is always
  // on, no toggle). judgeScoringEnabled can be true with an empty rubric
  // only transiently while editing — the wizard enforces at least one
  // criterion before it can be saved on. Both false = this round has no
  // scoring mechanism at all; decisions stay fully manual, no rank to go by.
  judgeScoringEnabled: boolean;
  audienceScoringEnabled: boolean;
}

// Backed by GCODE_EVENT_PANELISTS. Not a global account role — any
// signed-in user can be invited as a judging panelist for a specific event,
// same event-scoped-assignment shape as EventRound above. userId is unset
// until the invitee accepts (they may not have an account yet at invite
// time).
export interface EventPanelist {
  id: string;
  eventId: string;
  userId?: string;
  invitedEmail: string;
  status: "INVITED" | "ACCEPTED" | "DECLINED";
  invitedOn: string;
  respondedOn?: string | null;
}

// Backed by GCODE_COUPONS (contract-only, see docs/sql/coupons/).
// Event-scoped discount code, organizer-managed — computedStatus is derived
// server-side (expired/exhausted/inactive/active) so the UI never has to
// re-derive it from valid_from/valid_to/redemption_count itself.
export interface Coupon {
  id: string;
  eventId: string;
  code: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  maxRedemptions?: number;
  redemptionCount: number;
  validFrom?: string;
  validTo?: string;
  isActive: boolean;
  createdOn: string;
  computedStatus: "ACTIVE" | "INACTIVE" | "EXPIRED" | "SCHEDULED" | "EXHAUSTED";
}

// Backed by GCODE_UPI_PAYMENT_CLAIMS (contract-only, see docs/sql/coupons/).
// Self-reported offline UPI QR payment, pending organizer confirmation
// against their own bank/Razorpay settlement — not a verified payment.
export interface UpiClaim {
  id: string;
  eventId: string;
  email: string;
  fullName: string;
  utr: string;
  amountClaimed: number;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  submittedOn: string;
  reviewedBy?: string;
  reviewedOn?: string;
  participantId?: string;
}

// Backed by EVENT_STATUS lookup table — fixed lifecycle, not open-ended.
export type EventStatus =
  | "DRAFT"
  | "APPROVAL_PENDING"
  | "OPEN"
  | "REGISTRATION_CLOSED"
  | "ONGOING"
  | "COMPLETED"
  | "CANCELLED";

// One of the signed-in user's own registrations, joined to its event —
// backed by GCODE_EVENT_PARTICIPANTS_API.list_by_user.
export interface MyTicket {
  participantId: string;
  eventId: string;
  title: string;
  type: EventType;
  mode: "Online" | "In-Person" | "Hybrid";
  status?: EventStatus;
  date: string;
  time: string;
  location: string;
  coverImageUrl?: string;
  price: "Free" | string;
  quantity: number;
  amountPaid?: number;
  appliedOn: string;
  category: "Attendee" | "Participant";
}

// One of the event's two registration categories (Attendee / Participant).
// Both blocks always exist now — `enabled` is what the organizer toggles,
// independently and at any time (wizard, or a runtime open/close control on
// the organizer's event page), including after registration_deadline has
// passed. A disabled category still carries its historical registeredCount;
// it's just not offered on the register page.
export interface RegistrationCategory {
  enabled: boolean; // organizer toggle — can flip any time, not locked by registration_deadline
  label: string; // organizer text, falls back to "Attendee"/"Participant"
  description: string; // organizer text, falls back to ""
  price: number;
  priceLabel: "Free" | string;
  capacity?: number;
  registeredCount: number;
  spotsLeft?: number;
  maxTicketsPerRegistration?: number; // organizer cap per single booking, unset = no cap
  registrationCloses: string; // this category's own deadline, falls back to the event's start_date
  registrationDeadlineIso?: string | null; // raw ISO for computing "days left"
  registrationOpensIso?: string | null; // raw ISO — unset = open immediately, no start gate
}

// A pass can be organizer-enabled but still outside its own booking window
// (before registrationOpensIso, or after registrationDeadlineIso) — this is
// what the register page/event page use to grey out a pass without hiding
// it, instead of the organizer's `enabled` toggle (which only means "offered
// at all", not "bookable right now").
export function isRegistrationOpen(
  category: RegistrationCategory,
  now: Date = new Date(),
): boolean {
  if (category.registrationOpensIso) {
    if (now < new Date(category.registrationOpensIso)) return false;
  }
  if (category.registrationDeadlineIso) {
    if (now > new Date(category.registrationDeadlineIso)) return false;
  }
  return true;
}

// `now` is required (no Date.now() default) so callers must supply a
// trusted, server-anchored clock (see useServerNow) instead of silently
// falling back to the visiting browser's own — possibly wrong — clock.
export function hasEventEnded(
  event: Pick<Event, "endDateIso">,
  now: Date,
): boolean {
  if (!event.endDateIso) return false;
  return now > new Date(event.endDateIso);
}

export interface EventOrganizer {
  name: string; // backed by EventDetail.created_by; falls back to "GCODE Team"
  title: string; // no backend column — adapter hardcodes "Organizer"
  verified: boolean; // no backend column — adapter hardcodes false
  eventsHosted: number; // no backend column — adapter hardcodes 0
  attendees: number; // no backend column — adapter hardcodes 0
}

export interface Event {
  id: string; // EventListItem.id
  title: string; // EventListItem.event_name
  type: EventType; // EventListItem.event_type_id, resolved via EventTypeLookup
  mode: "Online" | "In-Person" | "Hybrid"; // EventListItem.mode_of_event_id, resolved via EventModeLookup
  status?: EventStatus; // EventListItem.status_id, resolved via EVENT_STATUS lookup
  price: "Free" | string; // derived from EventListItem.ticket_price
  priceAmount?: number; // EventListItem.ticket_price
  date: string; // derived from EventListItem.start_date
  time: string; // derived from EventListItem.start_date
  location: string; // derived from EventListItem.city + address
  registeredCount: number; // EventListItem.registered_count — live SUM(quantity) from GCODE_EVENT_PARTICIPANTS
  interestedCount?: number; // no backend column — never set
  spotsLeft?: number; // max_attendees - registeredCount
  capacity?: number; // EventListItem.max_attendees
  attendeeRegistration: RegistrationCategory; // always present, mirrors price/priceAmount/capacity/spotsLeft/registeredCount above; .enabled toggleable by the organizer
  participantRegistration: RegistrationCategory; // always present too — check .enabled, not presence, to see if the organizer has turned it on
  featured?: boolean; // EventListItem.is_featured
  maxTicketsPerRegistration?: number; // EventDetail.max_tickets_per_registration — organizer cap per single booking, unset = no cap
  is_featured?: boolean; // EventListItem.is_featured
  registrationCloses: string; // EventDetail.registration_deadline, falls back to start_date
  registrationDeadlineIso?: string | null; // EventDetail.registration_deadline, raw ISO for computing "days left"
  duration: string; // derived from start_date/end_date span, or the timeline's own span as fallback
  endDateIso?: string | null; // EventListItem.end_date, falls back to start_date — raw ISO for hasEventEnded()
  durationText?: string; // EventDetail.duration_text — organizer's free-text duration (e.g. "3 hours"), used as a display fallback when time is TBD
  teamSize: string; // no backend column — adapter hardcodes ""
  certificate: boolean; // no backend column — adapter hardcodes false
  description: string[]; // EventDetail.description (detail fetch only), wrapped in array
  timeline: EventTimelineItem[]; // EVENT_TIMELINE rows — adapter hardcodes [] for now
  rounds: EventRound[]; // GCODE_EVENT_ROUNDS rows — contract-only as of 2026-07-25, adapter hardcodes [] until the table exists
  organizer: EventOrganizer; // see EventOrganizer — only .name is backed
  terms: string[]; // EventDetail.terms, split on newline — falls back to DEFAULT_TERMS when blank
  eligibility: string[]; // EventDetail.eligibility, split on newline — falls back to DEFAULT_ELIGIBILITY when blank
  tags?: string[]; // EventDetail.categories (detail fetch only)
  socialLinks?: EventSocialLink[]; // no backend column — adapter never sets this
  coverImageUrl?: string; // EventListItem.cover_image_url
  mediaUrls?: string[]; // EventListItem.banner_image_url, wrapped in array
  participationLink?: string; // EventListItem.participation_link — column exists, not yet mapped in adapter
  // Contract-only — EVENTS has no RATING_MODE column yet as of 2026-07-21.
  // Missing/undefined -> "Competitive", same degrade convention as
  // status/mode above, so every event keeps today's 0-10 rating behavior
  // until an organizer opts into Casual (unlimited emoji taps).
  ratingMode: "Competitive" | "Casual";
  // EventDetail.audio_recording_enabled — gates the audio section on the
  // public additional-info page. Missing/undefined -> true, same degrade
  // convention as ratingMode above.
  audioRecordingEnabled: boolean;
  // EventDetail.age_category_requirement — gates/labels the age-category
  // section on the public additional-info page.
  ageCategoryRequirement: "OFF" | "OPTIONAL" | "REQUIRED";
  // EventDetail.track_submission_enabled / .member_names_enabled — gate the
  // participant-submitted YouTube tracks / team member names sections on
  // the additional-info page. Missing/undefined -> false (brand-new
  // opt-in features, no prior always-on behavior to preserve).
  trackSubmissionEnabled: boolean;
  memberNamesEnabled: boolean;
}
