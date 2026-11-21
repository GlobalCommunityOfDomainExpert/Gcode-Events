import "server-only";
import type {
  MyParticipationRow,
  ParticipantRow,
  ParticipantsRepository,
} from "./participants.repository";
import type {
  MyParticipation,
  Participant,
  ParticipantAdvancedAnswer,
  ParticipantAnswer,
  ParticipantSummary,
  RegistrationCategory,
} from "./participants.schemas";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

const category = (c: string | null): RegistrationCategory =>
  c === "PARTICIPANT" ? "PARTICIPANT" : "ATTENDEE";

export const toParticipantSummary = (
  r: ParticipantRow,
): ParticipantSummary => ({
  id: r.id,
  eventId: r.event_id,
  fullName: r.user_name ?? null,
  quantity: r.quantity,
  status: r.status ?? null,
  active: r.active === "Y",
  category: category(r.category),
  appliedOn: iso(r.applied_on),
  audioSubmissionUrl: r.audio_submission_url ?? null,
  audioSubmittedOn: iso(r.audio_submitted_on),
});

export const toParticipant = (r: ParticipantRow): Participant => ({
  ...toParticipantSummary(r),
  userId: r.user_id ?? null,
  email: r.email ?? null,
  phone: r.phone ?? null,
  roleName: r.role_name ?? null,
});

export const toMyParticipation = (r: MyParticipationRow): MyParticipation => ({
  participantId: r.participant_id,
  eventId: r.event_id,
  eventName: r.event_name,
  eventTypeId: r.event_type_id,
  modeOfEventId: r.mode_of_event_id,
  statusId: r.status_id,
  startDate: iso(r.start_date),
  city: r.city ?? null,
  address: r.address ?? null,
  ticketPrice: r.ticket_price ?? 0,
  participantPrice: r.participant_price ?? null,
  coverImageUrl: r.cover_image_url ?? null,
  quantity: r.quantity,
  status: r.status ?? null,
  active: r.active,
  appliedOn: r.applied_on.toISOString(),
  category:
    r.category === "ATTENDEE" || r.category === "PARTICIPANT"
      ? r.category
      : null,
});

type AnswerRow = Awaited<ReturnType<ParticipantsRepository["answers"]>>[number];
type AdvancedAnswerRow = Awaited<
  ReturnType<ParticipantsRepository["advancedAnswers"]>
>[number];

export const toAnswer = (r: AnswerRow): ParticipantAnswer => ({
  questionId: r.question_id,
  optionId: r.option_id ?? null,
  answerText: r.answer_text ?? null,
});

export const toAdvancedAnswer = (
  r: AdvancedAnswerRow,
): ParticipantAdvancedAnswer => ({
  questionId: r.question_id,
  settingId: r.setting_id,
  sourceOptionId: r.source_option_id ?? null,
  parentAdvancedOptionId: r.parent_adv_option_id || null,
  advancedOptionId: r.adv_option_id ?? null,
  isOther: Number(r.is_other) === 1,
  answerText: r.answer_text ?? null,
});
