import { apiRequest } from "./client";

export interface LivePerformer {
  participant_id: number | null;
  participant_name: string | null;
  // Only meaningful when `attendeeId` was passed — whether *this* attendee
  // has already rated the current performer, so a page refresh reflects the
  // lock instead of relying on client-only state.
  already_rated: boolean;
  // ISO timestamp — the 60s rating window for the current performer closes
  // at this instant. Null when no performer is currently set.
  window_closes_at: string | null;
  // Live average across all ratings so far for the current performer,
  // already scaled to out-of-100 (avg of 0-10 ratings * 10). Null until the
  // first rating comes in.
  avg_rating: number | null;
  rating_count: number;
  // Which round the current performer is live for — null if Live mode was
  // started before rounds existed, or the backend hasn't been patched for
  // this yet (contract-first, see ratings-round-id-backend.sql).
  round_id: number | null;
  // Intermission — the public scoreboard shows only the logo, nothing else
  // (no performer card, no rating UI, no floating reactions), regardless of
  // whatever participant_id/round_id happen to still be set underneath.
  // Independent of participant_id being null/set — starting an intermission
  // doesn't need to clear who was last on stage, ending it just needs to
  // reveal the scoreboard again.
  is_intermission: boolean;
}

export interface PerformedParticipant {
  participant_id: number;
  performed_at: string;
}

// Public — the attendee's page polls/streams this to know who's performing.
// Pass the caller's own attendee id to also get back `already_rated`.
export function getLivePerformer(
  eventId: number | string,
  attendeeId?: number | string,
): Promise<LivePerformer> {
  return apiRequest(`/events/${eventId}/live-performer`, {
    query: attendeeId !== undefined ? { attendee_id: attendeeId } : undefined,
  });
}

// Organizer-only — brings a Participant-category row "on stage" (sets who's
// currently performing) without opening the audience rating window. That's
// a separate, explicit step — see startRatingWindow below. `roundId` tags
// which round this performance belongs to (the Live tab's "live round") so
// ratings recorded during it can be attributed correctly — omit it for
// events with no round-scoped live judging set up yet.
export function setLivePerformer(
  eventId: number | string,
  participantId: number | string,
  roundId?: number | string,
): Promise<LivePerformer> {
  return apiRequest(`/events/${eventId}/live-performer`, {
    method: "PUT",
    body: {
      participant_id: participantId,
      ...(roundId !== undefined ? { round_id: roundId } : {}),
    },
  });
}

// Organizer-only — toggles intermission on/off for the public scoreboard.
// Shares the same PUT endpoint as setLivePerformer above, just a different
// body shape — doesn't touch participant_id, so whoever was last on stage
// is still there underneath once intermission ends.
export function setIntermission(
  eventId: number | string,
  active: boolean,
): Promise<LivePerformer> {
  return apiRequest(`/events/${eventId}/live-performer`, {
    method: "PUT",
    body: { is_intermission: active ? "Y" : "N" },
  });
}

// Organizer-only — opens the 60s audience rating window for whoever is
// currently on stage.
export function startRatingWindow(
  eventId: number | string,
): Promise<LivePerformer> {
  return apiRequest(`/events/${eventId}/live-performer/start-rating`, {
    method: "PUT",
    body: {},
  });
}

// Public — `attendeeId` is the caller's own participant id (guest-token
// model, same trust level as audio-submission). Fails with "already rated"
// if this attendee has already rated this performer — that's the lock.
export function submitRating(
  attendeeId: number | string,
  performerId: number | string,
  rating: number,
): Promise<{ created_on: string }> {
  return apiRequest(`/participants/${attendeeId}/rating`, {
    method: "PUT",
    body: { performer_id: performerId, rating },
  });
}

// Organizer-only — bulk-emails every Attendee-category registration their
// unique rating link.
export function sendRatingLinks(
  eventId: number | string,
): Promise<{ sent: number }> {
  return apiRequest(`/events/${eventId}/send-rating-links`, {
    method: "POST",
    body: {},
  });
}

// Organizer-only — every Participant-category row that has been marked as
// the current performer at least once (drives the Live tab's "Performed"
// badge, distinct from "Now performing").
export async function getPerformedParticipants(
  eventId: number | string,
): Promise<PerformedParticipant[]> {
  const { items } = await apiRequest<{ items: PerformedParticipant[] }>(
    `/events/${eventId}/performed-participants`,
  );
  return items;
}

export interface RoundRatingSummary {
  participant_id: number;
  avg_rating: number;
  rating_count: number;
}

// Organizer-only — every performed participant's audience rating average
// for one round (not just the current performer, unlike getLivePerformer
// above) — drives the live-tab leaderboard's audience-score column and the
// Rounds tab's Live Rating column for Offline rounds.
export async function listRoundRatings(
  eventId: number | string,
  roundId: number | string,
): Promise<RoundRatingSummary[]> {
  try {
    const { items } = await apiRequest<{ items: RoundRatingSummary[] }>(
      `/events/${eventId}/round-ratings`,
      { query: { round_id: roundId } },
    );
    return items;
  } catch {
    return [];
  }
}

// Casual mode's fixed emoji set — not configurable per event. Shared by the
// rate page's tap buttons, the bot simulator, and the
// GCODE_EVENT_REACTIONS.EMOJI check constraint on the backend — must match
// that constraint exactly (👌 was a stale mismatch, fixed to 😂).
export const REACTION_EMOJIS = ["👏", "🔥", "❤️", "😂", "👍"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface ReactionItem {
  id: number;
  emoji: string;
}

// Public and fully anonymous — no participant/attendee identity involved.
// `deviceToken` (see lib/reactions/device-token.ts) is the only thing tying
// repeated taps together; the server throttles to 1 per device per second
// (GCODE_RATINGS_API.submit_reaction), silently dropping faster ones rather
// than erroring, so this stays fire-and-forget from the caller's
// perspective same as before.
export function submitReaction(
  eventId: number | string,
  performerId: number | string,
  emoji: string,
  deviceToken: string,
): Promise<{ ok: boolean }> {
  return apiRequest(`/events/${eventId}/reactions`, {
    method: "POST",
    body: { performer_id: performerId, emoji, device_token: deviceToken },
  });
}

// Server-side only — called from the reactions SSE stream route, not from
// any client component. Append-only read: every reaction for this performer
// with id > sinceId, oldest first.
export async function listReactionsSince(
  eventId: number | string,
  performerId: number | string,
  sinceId: number,
): Promise<ReactionItem[]> {
  const { items } = await apiRequest<{ items: ReactionItem[] }>(
    `/events/${eventId}/reactions/since`,
    { query: { performer_id: performerId, since_id: sinceId } },
  );
  return items;
}
