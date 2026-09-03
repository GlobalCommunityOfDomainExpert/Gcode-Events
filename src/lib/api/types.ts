export interface EventListItem {
  id: number;
  event_type_id: number;
  event_name: string;

  mode_of_event_id: number;
  max_attendees: number | null;

  city: string;
  address: string | null;

  status_id: number;
  start_date: string | null;
  end_date: string | null;

  ticket_price: number;
  is_featured: number;
  cover_image_url: string | null;
  banner_image_url: string | null;
  participation_link: string | null;
  registered_count: number;
}

export interface EventDetail extends EventListItem {
  registration_start: string | null;
  registration_deadline: string | null;
  participant_registration_start: string | null;
  participant_registration_deadline: string | null;
  description: string | null;
  summary: string | null;
  certificate_offered: number;
  created_by: string | null;
  created_on: string;
  updated_by: string | null;
  updated_on: string | null;
  // GUID-derived (FK to gcode_users.user_id) — kept as string, see user_id
  // in CreateParticipantPayload for why.
  organizer_id: string | null;
  organizer_name: string | null;
  organizer_email: string | null;
  max_tickets_per_registration: number | null;
  participant_max_tickets_per_registration: number | null;
  // JSON-array-as-string from JSON_ARRAYAGG, e.g. "[1,2]" — parse before use.
  category_ids: string | null;
  category_names: string | null;
  terms: string | null;
  eligibility: string | null;
  duration_text: string | null;
  // Second registration category ("Participant" — people who perform an
  // activity in the event, e.g. hackathon builders), independent price +
  // capacity from the Attendee columns above. Not yet backed by the live
  // backend — contract only, backend implementation is separate work.
  // Both categories are independently toggleable — organizer can flip
  // either on/off any time (wizard, or the organizer's live event page),
  // including after the event's registration_deadline has passed. Missing
  // on a backend that hasn't added the column yet -> treated as enabled
  // (matches today's implicit always-on behavior).
  attendee_registration_enabled: number;
  participant_registration_enabled: number;
  participant_price: number | null;
  participant_capacity: number | null;
  participant_registered_count: number;
  // Organizer-facing display text for each category's pass-selection card.
  // Null/blank -> UI falls back to "Attendee"/"Participant" + no description.
  attendee_label: string | null;
  attendee_description: string | null;
  participant_label: string | null;
  participant_description: string | null;
  // Contract-only — EVENTS has no RATING_MODE column yet as of 2026-07-21.
  // Missing/undefined -> "COMPETITIVE", matching the degrade convention
  // above for attendee_registration_enabled etc.
  rating_mode?: "COMPETITIVE" | "CASUAL";
  // Missing/undefined -> treated as enabled, matching today's implicit
  // always-on behavior on a backend that hasn't added the column yet.
  audio_recording_enabled?: number;
  // Missing/undefined -> "OPTIONAL", same degrade convention as rating_mode.
  age_category_requirement?: "OFF" | "OPTIONAL" | "REQUIRED";
  // Gate participant-submitted YouTube tracks / team member names on the
  // additional-info page. Missing/undefined -> treated as disabled — both
  // are brand-new opt-in features with no prior always-on behavior.
  track_submission_enabled?: number;
  member_names_enabled?: number;
}

export interface ApiListResponse<T> {
  items: T[];
  hasMore: boolean;
  limit: number;
  offset: number;
  count: number;
}

export interface EventTypeLookup {
  id: number;
  name: string;
  description: string;
}

export interface ApiStatus {
  id: number;
  status_code: string;
  status_name: string;
  description: string;
}

export interface EventModeLookup {
  id: number;
  mode_name: string;
  description: string;
}

export interface CategoryLookup {
  id: number;
  category_name: string;
  description: string;
}

// Mirrors the ORDS POST /events binds -> GCODE_EVENTS_API.create_event params.
// title/event_type_id/mode_of_event_id required; rest optional (proc defaults them).
export interface CreateEventPayload {
  title: string;
  event_type_id: number;
  mode_of_event_id: number;
  status_id?: number;
  summary?: string;
  description?: string;
  start_date?: string | null; // ISO 8601 — explicit null clears a previously-set date/time on PUT, omitted key leaves it unchanged
  end_date?: string;
  registration_start?: string;
  registration_deadline?: string;
  participant_registration_start?: string;
  participant_registration_deadline?: string;
  city?: string;
  venue_address?: string;
  participation_link?: string;
  max_attendees?: number;
  ticket_price?: number;
  is_featured?: number;
  certificate_offered?: number;
  cover_image_url?: string;
  banner_image_url?: string;
  is_external?: number;
  external_url?: string;
  created_by?: string;
  organizer_id?: string;
  max_tickets_per_registration?: number;
  participant_max_tickets_per_registration?: number;
  terms?: string;
  eligibility?: string;
  duration_text?: string;
  attendee_registration_enabled?: number;
  participant_registration_enabled?: number;
  participant_price?: number;
  participant_capacity?: number;
  attendee_label?: string;
  attendee_description?: string;
  participant_label?: string;
  participant_description?: string;
  rating_mode?: "COMPETITIVE" | "CASUAL";
  audio_recording_enabled?: number;
  age_category_requirement?: "OFF" | "OPTIONAL" | "REQUIRED";
  track_submission_enabled?: number;
  member_names_enabled?: number;
}

export type UpdateEventPayload = Partial<CreateEventPayload>;

// Mirrors the ORDS POST /events/:id/participants binds ->
// GCODE_EVENT_PARTICIPANTS_API.create_participant. Always finds-or-creates
// the GCODE_USERS row by email/full_name server-side, signed-in or not —
// both binds are required regardless of the Authorization header.
// email/full_name are only required for a guest (no session) registration —
// the backend finds-or-creates the GCODE_USERS row from them. A signed-in
// user sends user_id instead and skips that lookup entirely; exactly one of
// user_id or (email + full_name) must be present.
export interface CreateParticipantPayload {
  email?: string;
  full_name?: string;
  phone?: string;
  // GCODE_USERS.user_id is GUID-derived (to_number(sys_guid(), 32 X's)) — up
  // to 39 decimal digits, past Number.MAX_SAFE_INTEGER. Must stay a string
  // end-to-end or JS mangles it on the way out.
  user_id?: string;
  quantity: number;
  // Optional — server defaults to "ATTENDEE" when omitted, so every event
  // that never enables Participant registration sends an unchanged payload.
  category?: "ATTENDEE" | "PARTICIPANT";
  // 'Y' bypasses the registration_start/registration_deadline window check
  // server-side (create_participant's p_skip_window_check) — capacity is
  // still enforced regardless. Only the organizer's wildcard-add flow
  // (AddParticipantsPanel) sets this; public registration never does, so
  // omitting it (server default 'N') keeps that path's behavior unchanged.
  skip_window_check?: "Y" | "N";
  // 'Y' bypasses the requirement that a brand-new guest email already went
  // through OTP verification (gcode_pending_users.is_verified='Y') before
  // create_participant will create their gcode_users row — the actual gate
  // that blocks a wildcard add for someone who never signed up at all.
  // Same organizer-only convention as skip_window_check above.
  skip_email_verification?: "Y" | "N";
}

// Mirrors GCODE_EVENT_PARTICIPANTS_API.list_by_event's refcursor row.
export interface ParticipantApi {
  id: number;
  event_id: number;
  user_id: string | null;
  user_name: string;
  quantity: number;
  status: string | null;
  active: string;
  applied_on: string;
  email: string | null;
  phone: string | null;
  role_name: string | null;
  // Optional — missing/undefined on rows from a backend that hasn't added
  // the column yet; frontend treats that the same as "ATTENDEE".
  category?: "ATTENDEE" | "PARTICIPANT";
  // A link the participant hosts themselves (Google Drive, etc.) rather than
  // a binary upload — avoids adding blob storage for large audio files.
  // Missing/undefined -> "not submitted yet", same degrade convention as
  // `category` above.
  audio_submission_url?: string | null;
  audio_submitted_on?: string | null;
  // Contract-only — GCODE_EVENT_PARTICIPANTS has no AGE_CATEGORY column yet
  // as of 2026-07-21. Captured on the additional-info page alongside the
  // audio submission (Participant-category rows only). Missing/undefined ->
  // "not answered yet", same degrade convention as `category` above.
  age_category?: "YOUNGSTER" | "ADULT" | "SENIOR" | null;
}

// Contract-only — GCODE_EVENT_ROUND_RUBRICS doesn't exist yet as of
// 2026-07-27. One scored criterion within a round's judging rubric, nested
// under EventRoundApi below — full-replace child of the round, same as the
// round itself is a full-replace child of the event.
export interface EventRoundRubricApi {
  id: number;
  round_id: number;
  sort_order: number;
  label: string;
  max_score: number;
}

// One organizer-configured round/stage within an event (e.g. "Round 1:
// Audition"). Mirrors EVENT_TIMELINE's shape/full-replace convention.
export interface EventRoundApi {
  id: number;
  event_id: number;
  sort_order: number;
  name: string;
  description: string | null;
  mode: "ONLINE" | "OFFLINE";
  // The live /events/:id/rounds handler is a raw SQL Collection Query whose
  // JSON_ARRAYAGG(...) "rubric" column comes back as an escaped JSON
  // *string*, not a nested array — confirmed live 2026-07-27. Adapters
  // parse defensively; don't assume the array shape holds elsewhere.
  rubric: EventRoundRubricApi[] | string;
  // NULL/0 = auto-shortlist disabled for this round.
  shortlist_count: number | null;
  start_time: string | null;
  end_time: string | null;
  // Only meaningful for whichever round resolves as "the" live round (see
  // resolveLiveRound in lib/rounds.ts) — blends the panelist rubric average
  // with the audience rating average. Missing/undefined -> 70/30.
  judge_weight?: number;
  audience_weight?: number;
  // 'Y'/'N' — Offline-round-only toggles (see EventRound in lib/event.ts
  // for the full explanation). Missing/undefined -> 'N', same degrade
  // convention as the other optional columns above (covers rows from before
  // this migration ran).
  judge_scoring_enabled?: "Y" | "N";
  audience_scoring_enabled?: "Y" | "N";
}

// Contract-only — GCODE_EVENT_ROUND_DECISIONS doesn't exist yet as of
// 2026-07-25. Append-only shortlist/reject history — a participant can have
// multiple rows for the same round over time; the latest by decided_on wins.
export interface RoundDecisionApi {
  id: number;
  round_id: number;
  participant_id: number;
  status: "SHORTLISTED" | "REJECTED";
  decided_by: string | null;
  decided_on: string;
  created_on: string;
}

// Contract-only — GCODE_EVENT_ROUND_SCORES doesn't exist yet as of
// 2026-07-27. Append-only per-criterion score history, same convention as
// RoundDecisionApi above — the latest by scored_on wins per
// (participant_id, criterion_id) pair.
export interface RoundScoreApi {
  id: number;
  round_id: number;
  participant_id: number;
  criterion_id: number;
  score: number;
  scored_by: string | null;
  scored_on: string;
  created_on: string;
}

// Contract-only — GCODE_EVENT_PANELISTS. Organizer's list view for one
// event (GET /events/:id/panelists).
export interface EventPanelistApi {
  id: number;
  event_id: number;
  // Cast to text server-side — GCODE_USERS.USER_ID can hold values well
  // past JS's safe-integer range; emitted as a bare JSON number, the
  // browser silently rounds it, breaking every string comparison against
  // the JWT's exact userId. See list_panelists' own comment.
  user_id: string | null;
  invited_email: string;
  status: "INVITED" | "ACCEPTED" | "DECLINED";
  invited_by: string | null;
  invited_on: string;
  responded_on: string | null;
}

// Single-invite lookup (GET /panelists/:id) — joined with the event title
// since the invitee's accept/decline page only has the panelist id, not the
// event id, from the link they clicked.
export interface PanelistInviteApi {
  id: number;
  event_id: number;
  event_title: string;
  invited_email: string;
  status: "INVITED" | "ACCEPTED" | "DECLINED";
  invited_on: string;
}

// Mirrors ORDS POST /events/:id/razorpay-order binds ->
// GCODE_PAYMENTS_API.create_order. Amount is computed server-side from
// ticket_price * quantity — never trust a client-sent amount. email/full_name
// are stored on the order row so the webhook path (no client request to pull
// them from) can still finalize registration on its own.
// Same email/full_name-vs-user_id rule as CreateParticipantPayload above.
export interface CreateRazorpayOrderPayload {
  email?: string;
  full_name?: string;
  phone?: string;
  user_id?: string;
  quantity: number;
  category?: "ATTENDEE" | "PARTICIPANT";
  // Optional discount code — validated + priced server-side in
  // GCODE_COUPONS_API.validate_coupon, never trust a client-computed amount.
  coupon_code?: string;
}

// Mirrors GCODE_PAYMENTS_API.create_order's response. key_id is Razorpay's
// public key (safe client-side) — echoed back so the frontend doesn't need
// its own env var; the key *secret* never leaves the backend.
export interface RazorpayOrderApi {
  order_id: string; // Razorpay order_xxx id
  amount: number; // paise
  currency: string; // "INR"
  key_id: string;
}

// A coupon that fully covers the price takes this shape instead of
// RazorpayOrderApi — the backend skips Razorpay entirely and registers the
// participant directly (GCODE_COUPONS_API.redeem_free_coupon /
// GCODE_UPI_CLAIMS_API.confirm_upi_claim), so there's no order to pay for.
export interface FreeRegistrationApi {
  free: true;
  participant_id: number;
}

export type CreateRazorpayOrderResult = RazorpayOrderApi | FreeRegistrationApi;

// Mirrors ORDS POST /participants/razorpay binds ->
// GCODE_PAYMENTS_API.verify_and_register. No event_id, email, full_name, or
// quantity — the backend already has all of that on the GCODE_PAYMENT_ORDERS
// row keyed by razorpay_order_id. This only carries what the backend needs
// to verify the signature (HMAC-SHA256 of order_id|payment_id using the key
// secret) before it creates the participant row — never trust a
// client-reported "paid" status.
export interface VerifyRazorpayPaymentPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

// Contract-only — GCODE_COUPONS doesn't exist on the live backend yet (see
// docs/sql/coupons/). Organizer's list view for one event
// (GET /events/:id/coupons), mirrors GCODE_COUPONS_API.list_coupons_for_event.
export interface CouponApi {
  id: number;
  event_id: number;
  code: string;
  discount_type: "PERCENT" | "FIXED";
  discount_value: number;
  max_redemptions: number | null;
  redemption_count: number;
  valid_from: string | null;
  valid_to: string | null;
  is_active: number; // 0/1
  created_on: string;
  computed_status:
    "ACTIVE" | "INACTIVE" | "EXPIRED" | "SCHEDULED" | "EXHAUSTED";
}

export interface CreateCouponPayload {
  code: string;
  discount_type: "PERCENT" | "FIXED";
  discount_value: number;
  max_redemptions?: number;
  valid_from?: string;
  valid_to?: string;
}

// Mirrors GCODE_COUPONS_API.validate_coupon's OUT params (POST
// /events/:id/coupons/validate). Called before checkout so the register
// page can show the discounted total; the same validation re-runs
// server-side inside create_order/redeem_free_coupon, so this response is
// informational only, never trusted for the actual charge.
export interface ValidateCouponResponse {
  coupon_id: number;
  discount_type: "PERCENT" | "FIXED";
  discount_value: number;
  original_amount: number;
  final_amount: number;
}

// Contract-only — GCODE_UPI_PAYMENT_CLAIMS doesn't exist on the live backend
// yet (see docs/sql/coupons/). No order_id exists for a static/offline UPI
// QR scan, so this is a self-reported claim an organizer manually confirms
// against their own bank/Razorpay settlement — not a cryptographic proof of
// payment. Mirrors GCODE_UPI_CLAIMS_API.list_upi_claims.
export interface UpiClaimApi {
  id: number;
  event_id: number;
  email: string;
  full_name: string;
  utr: string;
  amount_claimed: number;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  submitted_on: string;
  reviewed_by: string | null;
  reviewed_on: string | null;
  participant_id: number | null;
}

export interface SubmitUpiClaimPayload {
  email: string;
  full_name: string;
  utr: string;
  amount_claimed: number;
}

// Mirrors GCODE_EVENT_PARTICIPANTS_API.list_by_user's refcursor row — the
// signed-in user's own registrations, joined to the event they're for.
export interface MyParticipationApi {
  participant_id: number;
  event_id: number;
  event_name: string;
  event_type_id: number;
  mode_of_event_id: number;
  status_id: number;
  start_date: string | null;
  city: string;
  address: string | null;
  ticket_price: number;
  // Attendee-category price is `ticket_price` above; this is Participant's,
  // needed so adaptMyParticipation can price a Participant-category ticket.
  participant_price: number | null;
  cover_image_url: string | null;
  quantity: number;
  status: string | null;
  active: string;
  applied_on: string;
  category?: "ATTENDEE" | "PARTICIPANT";
}
