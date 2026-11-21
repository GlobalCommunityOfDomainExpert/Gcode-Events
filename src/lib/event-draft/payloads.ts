// The event editor's draft (EventDetailData) → the shapes the database
// writes take: EVENTS column values, and the JSON arrays the full-replace
// child procedures read (timeline, questions, advanced question tree,
// rounds). Pure functions — used by the server's save (src/server/modules/
// events) and by the browser for the live preview and the rounds tab.

import type { EventDetailData } from "@/lib/zod/event";
import { toIsoTimestamp } from "@/lib/datetime/ist";

// EVENTS column values, keyed by column name (= GCODE_EVENTS_API
// create_event/update_event parameter minus "p_"). title/event_type_id/
// mode_of_event_id required; the rest optional. On update, undefined and
// null both mean "leave unchanged" (update_event uses NVL).
export interface EventColumns {
  title: string;
  event_type_id: number;
  mode_of_event_id: number;
  status_id?: number;
  summary?: string;
  description?: string;
  start_date?: string | null; // ISO 8601
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
  // JSON string of StageJson[]; "[]" clears it (null cannot, see stagesJson).
  stages_json?: string | null;
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
  audio_recording_applies_to?: "ATTENDEE" | "PARTICIPANT";
}

// One day/stage of an event, as stored in EVENTS.STAGES_JSON.
export interface StageJson {
  label: string; // organizer's own text — "Day 1", "Round 1 – Online Screening"
  date: string; // yyyy-mm-dd, "" = to be announced
  end_date?: string; // yyyy-mm-dd last date of a multi-date day; absent/"" = one day
  time: string; // HH:mm, "" = TBD
  mode: "ONLINE" | "OFFLINE" | "BOTH"; // BOTH = same day, online and at the venue
  link: string; // ONLINE/BOTH — "" = nothing to join (e.g. video screening)
  venue: string; // OFFLINE/BOTH — "" = the event's own venue
  cta: "AUTO" | "SUBMIT" | "LINK";
  cta_label: string; // LINK only
  cta_url: string; // LINK only
}

// Draft → EVENTS column values. Only fields with a real backing column are
// set; stages, children and the cover are written separately. Who created/
// updated it is filled in by the server from the session.
export function toEventColumns(data: EventDetailData): EventColumns {
  if (data.type === null) {
    throw new Error("Event type is required before creating an event");
  }
  return {
    title: data.title,
    event_type_id: data.type,
    mode_of_event_id: data.mode,
    summary: data.summary.trim() || undefined,
    description: data.description || undefined,
    // update_event can't clear a date (NVL): blank keeps the saved one.
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
    audio_recording_applies_to: data.audioRecordingAppliesTo,
  };
}

// Days work for every event mode. `undefined` leaves the column untouched.
// To clear stages saved earlier it returns "[]": update_event uses
// NVL(param, column), so null could never clear the column. The backend
// turns "[]" into NULL.
export function stagesJson(
  data: EventDetailData,
  hadStages = false,
): string | null | undefined {
  if (data.stages.length === 0) return hadStages ? "[]" : undefined;
  const rows: StageJson[] = data.stages.map((s, i) => ({
    label: s.label.trim() || `Day ${i + 1}`,
    date: s.date,
    // Only a real range is written; same day or earlier = one day.
    end_date: s.date && s.endDate > s.date ? s.endDate : "",
    time: s.time,
    mode: s.mode,
    link: s.mode !== "OFFLINE" ? s.link.trim() : "",
    venue: s.mode !== "ONLINE" ? s.venue.trim() : "",
    cta: s.cta,
    // Any button can be relabelled; blank = the default wording.
    cta_label: s.ctaLabel.trim(),
    cta_url: s.cta === "LINK" ? s.ctaUrl.trim() : "",
  }));
  return JSON.stringify(rows);
}

export interface TimelinePayloadItem {
  title: string;
  description: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  dayLabel?: string; // D8: omitted unless the organizer filled one in
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
        // D8: only send when set, so a backend without the column is untouched.
        ...(item.dayLabel?.trim() && day
          ? { dayLabel: item.dayLabel.trim() }
          : {}),
        sortOrder: index,
      };
    });
}

export interface QuestionPayloadItem {
  prompt: string;
  questionType: "TEXT" | "RADIO" | "CHECKBOX";
  // 1/0, not a JS boolean — JSON_TABLE's NUMBER-typed PATH extraction
  // doesn't coerce a JSON `true`/`false` literal, confirmed live (came back
  // NULL -> defaulted to 0 regardless of what was sent).
  isRequired: 1 | 0;
  appliesTo: "ATTENDEE" | "PARTICIPANT";
  sortOrder: number;
  options: { label: string; sortOrder: number }[];
}

// Wizard question items -> GCODE_EVENT_QUESTIONS rows. Mirrors
// toRoundsPayload's blank-filter convention — a question with no prompt
// (or, for RADIO/CHECKBOX, no non-blank options) never reaches the backend.
export function toQuestionsPayload(
  data: EventDetailData,
): QuestionPayloadItem[] {
  return data.questions
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
          : q.options
              .filter((o) => o.label.trim() !== "")
              .map((o, optionIndex) => ({
                label: o.label,
                sortOrder: optionIndex,
              })),
    }));
}

export function toAdvancedQuestionConfiguration(data: EventDetailData) {
  const toNode = (
    option: EventDetailData["questions"][number]["options"][number],
    sortOrder: number,
  ): Record<string, unknown> => ({
    id: option.id,
    label: option.label,
    sortOrder,
    enabled: option.advancedEnabled,
    required: option.advancedRequired,
    options: option.advancedOptions
      .filter((child) => child.label.trim())
      .map(toNode),
  });
  return data.questions.flatMap((q) =>
    q.type === "CHECKBOX"
      ? q.options
          .filter((o) => o.id !== null)
          .map((o, sortOrder) => ({
            questionId: q.id,
            sourceOptionId: o.id,
            enabled:
              o.advancedEnabled &&
              !/^(other|others|other \(please specify\))$/i.test(
                o.label.trim(),
              ),
            required: o.advancedRequired,
            allowOther: q.allowOther,
            options: o.advancedOptions
              .filter((child) => child.label.trim())
              .map(toNode),
            sortOrder,
          }))
      : [],
  );
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
