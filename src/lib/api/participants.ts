import { ApiError, v1Request } from "./client";
import type {
  AudioSubmission,
  MyParticipation,
  Participant,
  ParticipantAnswers,
  ParticipantSummary,
  RegisterBody,
  RegistrationResult,
  SaveAnswersBody,
  TeamMember,
  YoutubeTrack,
} from "@/server/modules/participants/participants.schemas";

export type {
  AudioSubmission,
  MyParticipation,
  Participant,
  ParticipantAnswers,
  ParticipantSummary,
  RegisterBody,
  SaveAnswersBody,
  TeamMember,
  YoutubeTrack,
};

// /api/v1 registrations. Browser-only; server code calls participantsService.

// Free registration. Signed in → registers the session's own account (no
// identity fields needed); guest → email (verified via the guest OTP) and
// fullName. Organizers may pass someone else's email and the skip flags.
export function registerForEvent(
  eventId: number | string,
  body: Partial<RegisterBody>,
): Promise<RegistrationResult> {
  return v1Request(`/events/${eventId}/participants`, {
    method: "POST",
    body,
  });
}

// Organizer attendee list, with contact details (admin).
export function listParticipants(
  eventId: number | string,
): Promise<Participant[]> {
  return v1Request(`/events/${eventId}/participants`);
}

// A registration as its ?pid= link shows it; undefined when it doesn't exist.
export async function getParticipant(
  id: number | string,
): Promise<ParticipantSummary | undefined> {
  try {
    return await v1Request<ParticipantSummary>(`/participants/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}

// Organizer removing a registration (soft cancel — scores, decisions and
// payments tied to it are kept).
export function removeParticipant(id: number | string): Promise<void> {
  return v1Request(`/participants/${id}`, { method: "DELETE" });
}

// Registrations for the signed-in user, joined to their events.
export function listMyParticipations(): Promise<MyParticipation[]> {
  return v1Request("/me/participations");
}

// Answers to the event's custom questions plus the follow-up tree.
export function getParticipantAnswers(
  id: number | string,
): Promise<ParticipantAnswers> {
  return v1Request(`/participants/${id}/answers`);
}

// Each list given replaces the saved one; both are saved together.
export function saveParticipantAnswers(
  id: number | string,
  body: SaveAnswersBody,
): Promise<void> {
  return v1Request(`/participants/${id}/answers`, { method: "PUT", body });
}

// A Drive/YouTube link instead of a recording. Failures must reach the
// caller — the participant needs to know it didn't save before the 24h
// deadline passes.
export function submitParticipantAudio(
  id: number | string,
  url: string,
): Promise<AudioSubmission> {
  return v1Request(`/participants/${id}/audio-submission`, {
    method: "PUT",
    body: { url },
  });
}

// Organizer attendee drawer (admin).
export function listParticipantYoutubeTracks(
  id: number | string,
): Promise<YoutubeTrack[]> {
  return v1Request(`/participants/${id}/youtube-tracks`);
}

export function listParticipantTeamMembers(
  id: number | string,
): Promise<TeamMember[]> {
  return v1Request(`/participants/${id}/team-members`);
}

// Stays clear of Vercel's ~4.5MB serverless function body cap. Blobs at or
// under this go through a single POST; bigger ones are split into chunks and
// sent via OCI's multipart upload API instead, since no individual request
// body may cross that cap.
const MULTIPART_THRESHOLD_BYTES = 4 * 1024 * 1024;
const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

// Recorded audio, uploaded through our server to object storage.
export function uploadParticipantAudio(
  id: number | string,
  blob: Blob,
): Promise<AudioSubmission> {
  if (blob.size > MULTIPART_THRESHOLD_BYTES) {
    return uploadParticipantAudioChunked(id, blob);
  }
  return v1Request(`/participants/${id}/audio-submission`, {
    method: "POST",
    raw: { body: blob.type ? blob : new Blob([blob], { type: "audio/webm" }) },
  });
}

async function uploadParticipantAudioChunked(
  id: number | string,
  blob: Blob,
): Promise<AudioSubmission> {
  const base = `/participants/${id}/audio-submission/multipart`;
  const contentType = blob.type || "audio/webm";

  const { uploadId } = await v1Request<{ uploadId: string }>(`${base}/start`, {
    method: "POST",
    body: { contentType },
  });

  const parts: { partNum: number; etag: string }[] = [];
  try {
    let partNum = 1;
    for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE_BYTES) {
      const chunk = blob.slice(offset, offset + CHUNK_SIZE_BYTES);
      const { etag } = await v1Request<{ etag: string }>(`${base}/part`, {
        method: "POST",
        raw: {
          body: new Blob([chunk], { type: "application/octet-stream" }),
          headers: {
            "X-Upload-Id": uploadId,
            "X-Part-Number": String(partNum),
            "X-Audio-Content-Type": contentType,
          },
        },
      });
      parts.push({ partNum, etag });
      partNum += 1;
    }
  } catch (err) {
    await v1Request(`${base}/abort`, {
      method: "POST",
      body: { uploadId, contentType },
    }).catch(() => {});
    throw err;
  }

  return v1Request(`${base}/complete`, {
    method: "POST",
    body: { uploadId, parts, contentType },
  });
}
