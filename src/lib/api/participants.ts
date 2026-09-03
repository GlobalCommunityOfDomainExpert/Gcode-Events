import { apiRequest } from "./client";
import {
  ApiListResponse,
  CreateParticipantPayload,
  MyParticipationApi,
  ParticipantApi,
} from "./types";

// Guest registration: no sign-in required. Server finds-or-creates the
// GCODE_USERS row by email and links it to the new participant row.
export function registerForEvent(
  eventId: number | string,
  payload: CreateParticipantPayload,
): Promise<{ participant_id: number }> {
  return apiRequest(`/events/${eventId}/participants`, {
    method: "POST",
    body: payload,
  });
}

export async function listParticipants(
  eventId: number | string,
): Promise<ParticipantApi[]> {
  const { items } = await apiRequest<ApiListResponse<ParticipantApi>>(
    `/events/${eventId}/participants`,
  );
  return items;
}

export async function getParticipant(
  id: number | string,
): Promise<ParticipantApi | undefined> {
  const { items } = await apiRequest<{ items: ParticipantApi[] }>(
    `/participants/${id}`,
  );
  return items[0];
}

// GCODE_EVENT_PARTICIPANTS_API.delete_participant — removes the
// registration entirely (organizer-initiated, e.g. undoing a wildcard add
// or dropping a no-show). Round decisions/scores tied to this participant
// stay in GCODE_EVENT_ROUND_DECISIONS/SCORES (append-only history, not
// cleaned up here) — this only affects the registration row itself.
export function removeParticipant(id: number | string): Promise<void> {
  return apiRequest(`/participants/${id}`, { method: "DELETE" });
}

// Registrations for the signed-in user, joined to their events. Backend
// resolves user_id from the token itself (AUTH_PKG.get_verified_user_id) —
// this just carries the token as a query param, not the user_id.
export async function listMyParticipations(
  token: string,
): Promise<MyParticipationApi[]> {
  const { items } = await apiRequest<ApiListResponse<MyParticipationApi>>(
    "/participants/mine",
    { query: { p_token: token } },
  );
  return items;
}

// Persists the final audio location on the participant row. Unlike the
// read-side degrade-to-default convention elsewhere in this file, a failure
// here must reach the caller — the participant needs to know their
// submission didn't save before the 24h deadline passes.
export function submitParticipantAudio(
  id: number | string,
  audioUrl: string,
): Promise<{ audio_submission_url: string; audio_submitted_on: string }> {
  return apiRequest(`/participants/${id}/audio-submission`, {
    method: "PUT",
    body: { audio_submission_url: audioUrl },
  });
}

export type AgeCategory = "YOUNGSTER" | "ADULT" | "SENIOR";

// Contract-only — see the ParticipantApi.age_category comment in types.ts.
// Mirrors submitParticipantAudio's PUT shape/error convention.
export function submitParticipantAgeCategory(
  id: number | string,
  ageCategory: AgeCategory,
): Promise<{ age_category: AgeCategory }> {
  return apiRequest(`/participants/${id}/age-category`, {
    method: "PUT",
    body: { age_category: ageCategory },
  });
}

// Participant-submitted YouTube tracks / team member names — gated per-event
// by EVENTS.TRACK_SUBMISSION_ENABLED / .MEMBER_NAMES_ENABLED (see
// EventDetail in types.ts). Full-replace child collections, same
// delete-then-bulk-insert pattern as replaceEventTimeline in events.ts, just
// scoped to a participant instead of an event.

export interface ParticipantYoutubeTrackApi {
  track_name: string;
  youtube_url: string;
  sort_order: number;
}

export async function listParticipantYoutubeTracks(
  id: number | string,
): Promise<ParticipantYoutubeTrackApi[]> {
  const { items } = await apiRequest<
    ApiListResponse<ParticipantYoutubeTrackApi>
  >(`/participants/${id}/youtube-tracks`);
  return items;
}

export function replaceParticipantYoutubeTracks(
  id: number | string,
  items: { trackName: string; youtubeUrl: string; sortOrder: number }[],
): Promise<unknown> {
  return apiRequest(`/participants/${id}/youtube-tracks`, {
    method: "POST",
    body: items,
  });
}

export interface ParticipantTeamMemberApi {
  member_name: string;
  sort_order: number;
}

export async function listParticipantTeamMembers(
  id: number | string,
): Promise<ParticipantTeamMemberApi[]> {
  const { items } = await apiRequest<
    ApiListResponse<ParticipantTeamMemberApi>
  >(`/participants/${id}/team-members`);
  return items;
}

export function replaceParticipantTeamMembers(
  id: number | string,
  items: { memberName: string; sortOrder: number }[],
): Promise<unknown> {
  return apiRequest(`/participants/${id}/team-members`, {
    method: "POST",
    body: items,
  });
}

// Stays clear of Vercel's ~4.5MB serverless function body cap. Blobs at or
// under this go through a single POST; bigger ones are split into chunks and
// sent via OCI's multipart upload API instead, since no individual request
// body may cross that cap.
const MULTIPART_THRESHOLD_BYTES = 4 * 1024 * 1024;
const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

// Sends the recorded/uploaded blob to our own Next.js API route, which
// uploads it to OCI Object Storage server-side and persists the resulting
// URL — avoids a direct browser-to-OCI PUT, which needs a CORS rule the
// bucket doesn't support.
export async function uploadParticipantAudio(
  id: number | string,
  blob: Blob,
): Promise<{ audio_submission_url: string; audio_submitted_on: string }> {
  if (blob.size > MULTIPART_THRESHOLD_BYTES) {
    return uploadParticipantAudioChunked(id, blob);
  }
  const res = await fetch(`/api/participants/${id}/audio-submission`, {
    method: "POST",
    headers: { "Content-Type": blob.type || "audio/webm" },
    body: blob,
  });
  if (!res.ok) {
    throw new Error("Couldn't save your submission. Please try again.");
  }
  return res.json();
}

async function uploadParticipantAudioChunked(
  id: number | string,
  blob: Blob,
): Promise<{ audio_submission_url: string; audio_submitted_on: string }> {
  const base = `/api/participants/${id}/audio-submission/multipart`;
  const fail = () =>
    new Error("Couldn't save your submission. Please try again.");
  const contentType = blob.type || "audio/webm";

  const startRes = await fetch(`${base}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType }),
  });
  if (!startRes.ok) throw fail();
  const { uploadId } = await startRes.json();

  const parts: { partNum: number; etag: string }[] = [];
  try {
    let partNum = 1;
    for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE_BYTES) {
      const chunk = blob.slice(offset, offset + CHUNK_SIZE_BYTES);
      const partRes = await fetch(`${base}/part`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Upload-Id": uploadId,
          "X-Part-Number": String(partNum),
          "X-Audio-Content-Type": contentType,
        },
        body: chunk,
      });
      if (!partRes.ok) throw fail();
      const { etag } = await partRes.json();
      parts.push({ partNum, etag });
      partNum += 1;
    }
  } catch (err) {
    await fetch(`${base}/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId, contentType }),
    }).catch(() => {});
    throw err;
  }

  const completeRes = await fetch(`${base}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, parts, contentType }),
  });
  if (!completeRes.ok) throw fail();
  return completeRes.json();
}
