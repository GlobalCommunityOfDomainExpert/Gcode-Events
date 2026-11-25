import { z } from "zod";

// API contract for registrations. Shared with src/lib/api/participants.ts.
//
// Access: a guest's registration has no login, so its participant id (in
// the ?pid= links the app and the confirmation email use) is what lets them
// view it and add their extra info — as with ORDS. What that link exposes
// is limited to ParticipantSummary (no email/phone); contact details are
// admin-only, via the organizer's attendee list.

export type RegistrationCategory = "ATTENDEE" | "PARTICIPANT";

// What a registration link shows.
export interface ParticipantSummary {
  id: number;
  eventId: number;
  fullName: string | null;
  quantity: number;
  status: string | null;
  active: boolean;
  category: RegistrationCategory;
  appliedOn: string | null;
  audioSubmissionUrl: string | null;
  audioSubmittedOn: string | null;
}

// Organizer's attendee list (admin only).
export interface Participant extends ParticipantSummary {
  userId: string | null;
  email: string | null;
  phone: string | null;
  roleName: string | null;
}

// The signed-in user's registration, joined to its event.
export interface MyParticipation {
  participantId: number;
  eventId: number;
  eventName: string;
  eventTypeId: number;
  modeOfEventId: number;
  statusId: number;
  startDate: string | null;
  city: string | null;
  address: string | null;
  ticketPrice: number;
  // The ATTENDEE price is ticketPrice; this is the PARTICIPANT category's.
  participantPrice: number | null;
  coverImageUrl: string | null;
  quantity: number;
  status: string | null;
  active: string;
  appliedOn: string;
  category: RegistrationCategory | null;
}

// POST /api/v1/events/:id/participants (free registration).
// Signed in → registers the session's own account; email/fullName are
// ignored. Guest → email (verified via guest-otp) and fullName required.
// An admin may register someone else by email, and may bypass the window
// and email-verification checks (wildcard entries).
export const registerSchema = z.object({
  quantity: z.number().int().min(1).max(100).default(1),
  category: z.enum(["ATTENDEE", "PARTICIPANT"]).default("ATTENDEE"),
  email: z.string().trim().max(320).optional(),
  fullName: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  skipWindowCheck: z.boolean().optional(),
  skipEmailVerification: z.boolean().optional(),
});

export type RegisterBody = z.infer<typeof registerSchema>;

export interface RegistrationResult {
  participantId: number;
}

// Answers to the event's custom questions: one row per chosen option, or
// one text row (optionId null) for a TEXT question.
export interface ParticipantAnswer {
  questionId: number;
  optionId: number | null;
  answerText: string | null;
}

// Answers in the advanced follow-up tree.
export interface ParticipantAdvancedAnswer {
  questionId: number;
  settingId: number;
  sourceOptionId: number | null;
  parentAdvancedOptionId: number | null;
  advancedOptionId: number | null;
  isOther: boolean;
  answerText: string | null;
}

export interface ParticipantAnswers {
  answers: ParticipantAnswer[];
  advancedAnswers: ParticipantAdvancedAnswer[];
}

const id = z.number().int().positive();

// PUT /api/v1/participants/:id/answers — each list given is replaced in
// full; a list left out is untouched. Both are saved in one transaction.
export const saveAnswersSchema = z
  .object({
    answers: z
      .array(
        z.object({
          questionId: id,
          optionId: id.optional(),
          answerText: z.string().max(1000).optional(),
        }),
      )
      .max(500)
      .optional(),
    advancedAnswers: z
      .array(
        z.object({
          questionId: id,
          settingId: id,
          sourceOptionId: id.optional(),
          parentAdvancedOptionId: id.optional(),
          advancedOptionId: id.optional(),
          isOther: z.boolean(),
          answerText: z.string().max(1000).optional(),
        }),
      )
      .max(500)
      .optional(),
  })
  .refine((b) => b.answers || b.advancedAnswers, "Nothing to save");

export type SaveAnswersBody = z.infer<typeof saveAnswersSchema>;

export interface AudioSubmission {
  audioSubmissionUrl: string;
  audioSubmittedOn: string | null;
}

// PUT /api/v1/participants/:id/audio-submission — a link (Drive/YouTube…)
// instead of an uploaded recording.
export const audioLinkSchema = z.object({
  url: z.string().trim().url().max(1000),
});

export interface YoutubeTrack {
  trackName: string;
  youtubeUrl: string;
  sortOrder: number;
}

export interface TeamMember {
  memberName: string;
  sortOrder: number;
}

export const participantIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Chunked audio upload (recordings over ~4 MB).
export const multipartStartSchema = z.object({
  contentType: z.string().max(100).default("audio/webm"),
});
export const multipartCompleteSchema = z.object({
  uploadId: z.string().min(1).max(500),
  contentType: z.string().max(100).default("audio/webm"),
  parts: z
    .array(
      z.object({
        partNum: z.number().int().positive(),
        etag: z.string().min(1),
      }),
    )
    .min(1)
    .max(1000),
});
export const multipartAbortSchema = z.object({
  uploadId: z.string().min(1).max(500),
  contentType: z.string().max(100).default("audio/webm"),
});
