import "server-only";
import { isAdmin, type SessionUser } from "@/server/auth/session";
import { transaction, within } from "@/server/db/transaction";
import { AppError } from "@/server/http/errors";
import { assertEventStaff } from "@/server/modules/panelists/panelists.service";
import {
  abortAudioMultipartUpload,
  commitAudioMultipartUpload,
  startAudioMultipartUpload,
  uploadAudioObject,
  uploadAudioPart,
} from "@/infrastructure/storage/oci-object-storage";
import {
  toAdvancedAnswer,
  toAnswer,
  toMyParticipation,
  toParticipant,
  toParticipantSummary,
} from "./participants.mapper";
import {
  createParticipantsRepository,
  participantsRepository as repo,
  type ParticipantRow,
} from "./participants.repository";
import type {
  AudioSubmission,
  ParticipantAnswers,
  RegisterBody,
  RegistrationResult,
  SaveAnswersBody,
} from "./participants.schemas";

// Carried over from the register page, which skips the email-code step for
// these events (the ORDS handler waived verification for them too).
const EMAIL_VERIFICATION_EXEMPT_EVENTS = new Set([422]);

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // per request (single upload or chunk)

// Who may change a registration through its link: anyone holding it when
// signed out (that's how guests reach their registration — see
// participants.schemas.ts), but a signed-in user only for their own
// registration, unless they're an admin.
function assertCanModify(
  participant: ParticipantRow,
  user: SessionUser | null,
) {
  if (!user || isAdmin(user)) return;
  if (participant.user_id !== user.userId) {
    throw AppError.forbidden("This registration belongs to someone else");
  }
}

async function loadForWrite(
  id: number,
  user: SessionUser | null,
): Promise<ParticipantRow> {
  const participant = await repo.getById(id);
  if (!participant) throw AppError.notFound("Registration");
  assertCanModify(participant, user);
  return participant;
}

function audioType(contentType: string | null | undefined): string {
  const type =
    (contentType ?? "").split(";")[0].trim().toLowerCase() || "audio/webm";
  if (!type.startsWith("audio/"))
    throw AppError.badRequest("Only audio recordings can be uploaded");
  return type;
}

function audioBytes(bytes: Buffer, what = "recording"): Buffer {
  if (bytes.length === 0) throw AppError.badRequest(`The ${what} is empty`);
  if (bytes.length > MAX_AUDIO_BYTES)
    throw AppError.badRequest(`The ${what} is too large`);
  return bytes;
}

async function recordSubmission(
  id: number,
  url: string,
): Promise<AudioSubmission> {
  const submittedOn = await repo.submitAudio(id, url);
  return {
    audioSubmissionUrl: url,
    audioSubmittedOn: submittedOn?.toISOString() ?? null,
  };
}

export const participantsService = {
  // Always the caller's own registrations — from the session.
  async listMine(user: SessionUser) {
    return (await repo.listByUser(user.userId)).map(toMyParticipation);
  },

  async register(
    eventId: number,
    body: RegisterBody,
    user: SessionUser | null,
  ): Promise<RegistrationResult> {
    const admin = isAdmin(user);
    if ((body.skipWindowCheck || body.skipEmailVerification) && !admin) {
      throw AppError.forbidden(
        "Only organizers can bypass registration checks",
      );
    }
    if (!(await repo.eventExists(eventId))) throw AppError.notFound("Event");

    // Whose registration this is. Never taken from the body for a signed-in
    // non-admin: they can only register themselves.
    const registeringOther = admin && !!body.email;
    const who =
      user && !registeringOther
        ? { userId: user.userId }
        : { email: body.email, fullName: body.fullName, phone: body.phone };
    if (!("userId" in who) && (!who.email || !who.fullName)) {
      throw AppError.badRequest("Name and email are required to register");
    }

    if (await repo.findActiveRegistration(eventId, who)) {
      throw new AppError(
        "CONFLICT",
        "You're already registered for this event.",
      );
    }

    const participantId = await repo.create({
      eventId,
      ...who,
      quantity: body.quantity,
      category: body.category,
      skipWindowCheck: admin && !!body.skipWindowCheck,
      skipEmailVerification:
        (admin && !!body.skipEmailVerification) ||
        EMAIL_VERIFICATION_EXEMPT_EVENTS.has(eventId),
    });
    return { participantId };
  },

  async get(id: number) {
    const participant = await repo.getById(id);
    if (!participant) throw AppError.notFound("Registration");
    return toParticipantSummary(participant);
  },

  // Full attendee list, contact details included — for trusted server
  // callers that did their own access check (the client dashboard).
  async listForEvent(eventId: number) {
    return (await repo.listByEvent(eventId)).map(toParticipant);
  },

  // The API's attendee list: organizers get contact details; the event's
  // accepted panelists (the judge page) get the list without them.
  async listForStaff(eventId: number, user: SessionUser) {
    const role = await assertEventStaff(eventId, user);
    const rows = await this.listForEvent(eventId);
    return role === "admin"
      ? rows
      : rows.map((p) => ({ ...p, email: null, phone: null }));
  },

  async cancel(id: number) {
    if (!(await repo.getById(id))) throw AppError.notFound("Registration");
    await repo.cancel(id);
  },

  async answers(id: number): Promise<ParticipantAnswers> {
    if (!(await repo.getById(id))) throw AppError.notFound("Registration");
    const [answers, advanced] = await Promise.all([
      repo.answers(id),
      repo.advancedAnswers(id),
    ]);
    return {
      answers: answers.map(toAnswer),
      advancedAnswers: advanced.map(toAdvancedAnswer),
    };
  },

  async saveAnswers(
    id: number,
    body: SaveAnswersBody,
    user: SessionUser | null,
  ) {
    await loadForWrite(id, user);
    await transaction(async (tx) => {
      const r = createParticipantsRepository(within(tx));
      if (body.answers) {
        await r.replaceAnswers(id, JSON.stringify(body.answers));
      }
      if (body.advancedAnswers) {
        // The procedure reads isOther as a number.
        const items = body.advancedAnswers.map((a) => ({
          ...a,
          isOther: a.isOther ? 1 : 0,
        }));
        await r.saveAdvancedAnswers(id, JSON.stringify(items));
      }
    });
  },

  async submitAudioLink(id: number, url: string, user: SessionUser | null) {
    await loadForWrite(id, user);
    return recordSubmission(id, url);
  },

  async uploadAudio(
    id: number,
    bytes: Buffer,
    contentType: string | null,
    user: SessionUser | null,
  ) {
    await loadForWrite(id, user);
    const url = await uploadAudioObject(
      String(id),
      audioBytes(bytes),
      audioType(contentType),
    );
    return recordSubmission(id, url);
  },

  async startAudioUpload(
    id: number,
    contentType: string,
    user: SessionUser | null,
  ) {
    await loadForWrite(id, user);
    return {
      uploadId: await startAudioMultipartUpload(
        String(id),
        audioType(contentType),
      ),
    };
  },

  async uploadAudioPart(
    id: number,
    part: {
      uploadId: string;
      partNum: number;
      contentType: string | null;
      bytes: Buffer;
    },
    user: SessionUser | null,
  ) {
    await loadForWrite(id, user);
    const etag = await uploadAudioPart(
      String(id),
      part.uploadId,
      part.partNum,
      audioBytes(part.bytes, "chunk"),
      audioType(part.contentType),
    );
    return { etag };
  },

  async completeAudioUpload(
    id: number,
    upload: {
      uploadId: string;
      parts: { partNum: number; etag: string }[];
      contentType: string;
    },
    user: SessionUser | null,
  ) {
    await loadForWrite(id, user);
    const url = await commitAudioMultipartUpload(
      String(id),
      upload.uploadId,
      upload.parts,
      audioType(upload.contentType),
    );
    return recordSubmission(id, url);
  },

  // Best-effort cleanup of an abandoned chunked upload.
  async abortAudioUpload(
    id: number,
    uploadId: string,
    contentType: string,
    user: SessionUser | null,
  ) {
    await loadForWrite(id, user);
    await abortAudioMultipartUpload(
      String(id),
      uploadId,
      audioType(contentType),
    ).catch((err) => console.error("[participants] abort upload failed", err));
  },

  // Organizer attendee drawer (admin routes).
  async youtubeTracks(id: number) {
    return (await repo.youtubeTracks(id)).map((r) => ({
      trackName: r.track_name,
      youtubeUrl: r.youtube_url,
      sortOrder: r.sort_order ?? 0,
    }));
  },

  async teamMembers(id: number) {
    return (await repo.teamMembers(id)).map((r) => ({
      memberName: r.member_name,
      sortOrder: r.sort_order ?? 0,
    }));
  },
};
