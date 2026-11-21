import { getEvent, getEventQuestions } from "@/lib/api/events";
import type { EventDetail } from "@/lib/api/events";
import { getParticipant, getParticipantAnswers } from "@/lib/api/participants";
import type { ParticipantSummary } from "@/lib/api/participants";
import type { ParticipantAnswer } from "@/server/modules/participants/participants.schemas";
import type { EventQuestion } from "@/server/modules/questions/questions.schemas";
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
    | "audioRecordingEnabled"
    | "audioRecordingAppliesTo"
    | "registrationDeadline"
    | "participantRegistrationDeadline"
  >;
  questions: Pick<EventQuestion, "id" | "appliesTo" | "required">[];
  participant: Pick<
    ParticipantSummary,
    "category" | "audioSubmissionUrl" | "appliedOn"
  >;
  answers: ParticipantAnswer[];
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
  const asked = questions.filter((q) => q.appliesTo === category && q.required);
  const answeredIds = new Set(
    answers
      .filter((a) => a.optionId !== null || !!a.answerText?.trim())
      .map((a) => a.questionId),
  );
  const answered = asked.filter((q) => answeredIds.has(q.id)).length;
  const clipApplies =
    detail.audioRecordingEnabled && detail.audioRecordingAppliesTo === category;
  const needsClip = clipApplies && !participant.audioSubmissionUrl;

  const closes =
    (category === "PARTICIPANT"
      ? detail.participantRegistrationDeadline
      : detail.registrationDeadline) ?? participant.appliedOn;
  // No deadline and no booking date: nothing to count down to.
  if (!closes) return null;
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
  const [detail, { questions }, participant] = await Promise.all([
    getEvent(ticket.eventId),
    getEventQuestions(ticket.eventId),
    getParticipant(ticket.participantId),
  ]);
  if (!detail || !participant) return null;

  const category = participant.category ?? "ATTENDEE";
  const hasRequired = questions.some(
    (q) => q.appliesTo === category && q.required,
  );
  const answers = hasRequired
    ? (await getParticipantAnswers(ticket.participantId)).answers
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
