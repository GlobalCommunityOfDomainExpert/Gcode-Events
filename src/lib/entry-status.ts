import { getEvent, listEventQuestions } from "@/lib/api/events";
import { getParticipant, listParticipantAnswers } from "@/lib/api/participants";
import type {
  EventDetail,
  EventQuestionApi,
  ParticipantAnswerApi,
  ParticipantApi,
} from "@/lib/api/types";
import type { MyTicket } from "@/lib/event";

// Same window the additional-info page enforces: entries can be completed
// until 24h after the booking's own category closes registration.
const SUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface EntryTodo {
  ticket: MyTicket;
  /** required questions answered / asked */
  answered: number;
  required: number;
  /** the organizer wants audio and none is in yet */
  needsClip: boolean;
  deadline: Date;
  href: string;
}

interface EntryInputs {
  ticket: MyTicket;
  detail: Pick<
    EventDetail,
    | "audio_recording_enabled"
    | "audio_recording_applies_to"
    | "registration_deadline"
    | "participant_registration_deadline"
  >;
  questions: Pick<EventQuestionApi, "id" | "applies_to" | "is_required">[];
  participant: Pick<
    ParticipantApi,
    "category" | "audio_submission_url" | "applied_on"
  >;
  answers: Pick<
    ParticipantAnswerApi,
    "question_id" | "option_id" | "answer_text"
  >[];
}

/**
 * Pure part: what's still missing from one booking's entry, or null when
 * nothing is (no questions for this pass, all answered, or the window already
 * closed — a closed window is the additional-info page's job to explain, not
 * a nudge). Required follow-up questions are not counted (the entry page
 * still blocks saving without them).
 */
export function computeEntryTodo(
  { ticket, detail, questions, participant, answers }: EntryInputs,
  now = new Date(),
): EntryTodo | null {
  const category = participant.category ?? "ATTENDEE";
  const asked = questions.filter(
    (q) => q.applies_to === category && Number(q.is_required) === 1,
  );
  const answeredIds = new Set(
    answers
      .filter((a) => a.option_id !== null || !!a.answer_text?.trim())
      .map((a) => a.question_id),
  );
  const answered = asked.filter((q) => answeredIds.has(q.id)).length;
  // Mirrors the adapter: audio is on unless the event explicitly turns it off.
  const clipApplies =
    Number(detail.audio_recording_enabled) !== 0 &&
    (detail.audio_recording_applies_to ?? "PARTICIPANT") === category;
  const needsClip = clipApplies && !participant.audio_submission_url;

  const closes =
    (category === "PARTICIPANT"
      ? detail.participant_registration_deadline
      : detail.registration_deadline) ?? participant.applied_on;
  const deadline = new Date(new Date(closes).getTime() + SUBMISSION_WINDOW_MS);
  if (deadline <= now) return null;
  if (answered === asked.length && !needsClip) return null;

  return {
    ticket,
    answered,
    required: asked.length,
    needsClip,
    deadline,
    href: `/events/${ticket.eventId}/additional-info?pid=${ticket.participantId}`,
  };
}

/**
 * Fetches what's needed for one ticket and computes its todo. Reads only.
 * Answers are fetched only when the pass has required questions. Throws on
 * API failure — callers treat that as "nothing to show".
 */
export async function entryTodoFor(
  ticket: MyTicket,
  now = new Date(),
): Promise<EntryTodo | null> {
  const [detail, questions, participant] = await Promise.all([
    getEvent(ticket.eventId),
    listEventQuestions(ticket.eventId),
    getParticipant(ticket.participantId),
  ]);
  if (!detail || !participant) return null;

  const category = participant.category ?? "ATTENDEE";
  const hasRequired = questions.some(
    (q) => q.applies_to === category && Number(q.is_required) === 1,
  );
  const answers = hasRequired
    ? await listParticipantAnswers(ticket.participantId)
    : [];
  return computeEntryTodo(
    { ticket, detail, questions, participant, answers },
    now,
  );
}

/** "2d 4h" / "5h 12m" — coarse on purpose, it's a nudge not a timer. */
export function timeLeft(deadline: Date, now = new Date()): string {
  const mins = Math.max(
    0,
    Math.floor((deadline.getTime() - now.getTime()) / 60_000),
  );
  const h = Math.floor(mins / 60);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${mins % 60}m`;
}
