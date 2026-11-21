import { v1Request } from "./client";
import type {
  LiveState,
  PerformedParticipant,
  Reaction,
  RoundRatingSummary,
} from "@/server/modules/live/live.schemas";

export {
  REACTION_EMOJIS,
  type ReactionEmoji,
} from "@/server/modules/live/live.schemas";
export type { PerformedParticipant, RoundRatingSummary };
export type LivePerformer = LiveState;
export type ReactionItem = Reaction;

// /api/v1 live event: who's on stage, audience ratings, reactions.
// Browser-only. Pages that follow the state live subscribe to
// liveStateStreamUrl() with EventSource instead of polling.

export function liveStateStreamUrl(
  eventId: number | string,
  attendeeId?: number | string,
): string {
  const query = attendeeId !== undefined ? `?attendeeId=${attendeeId}` : "";
  return `/api/v1/events/${eventId}/live-state/stream${query}`;
}

export function reactionsStreamUrl(
  eventId: number | string,
  performerId: number | string,
): string {
  return `/api/v1/events/${eventId}/reactions/stream?performerId=${performerId}`;
}

// Public. Pass the caller's own attendee id to also get `alreadyRated`.
export function getLivePerformer(
  eventId: number | string,
  attendeeId?: number | string,
): Promise<LivePerformer> {
  return v1Request(`/events/${eventId}/live-state`, {
    query: attendeeId !== undefined ? { attendeeId } : undefined,
  });
}

// Organizer (admin): brings a Participant-category entry on stage without
// opening the rating window (see startRatingWindow). `roundId` tags which
// round the performance belongs to, so its ratings are attributed to it.
export function setLivePerformer(
  eventId: number | string,
  participantId: number | string,
  roundId?: number | string,
): Promise<LivePerformer> {
  return v1Request(`/events/${eventId}/live-state/performer`, {
    method: "PUT",
    body: {
      participantId: Number(participantId),
      ...(roundId !== undefined && { roundId: Number(roundId) }),
    },
  });
}

// Organizer (admin): intermission on/off for the public scoreboard. Whoever
// was on stage stays set underneath.
export function setIntermission(
  eventId: number | string,
  active: boolean,
): Promise<LivePerformer> {
  return v1Request(`/events/${eventId}/live-state/intermission`, {
    method: "PUT",
    body: { active },
  });
}

// Organizer (admin): opens the audience rating window for whoever is on
// stage.
export function startRatingWindow(
  eventId: number | string,
): Promise<LivePerformer> {
  return v1Request(`/events/${eventId}/live-state/rating-window`, {
    method: "POST",
  });
}

// Public — `attendeeId` is the rater's own Attendee registration (from the
// rating link). Rejects with "already rated" once they've rated this
// performer, or when the window is closed.
export function submitRating(
  attendeeId: number | string,
  performerId: number | string,
  rating: number,
): Promise<{ createdOn: string | null }> {
  return v1Request(`/participants/${attendeeId}/ratings`, {
    method: "POST",
    body: { performerId: Number(performerId), rating },
  });
}

// Organizer (admin): emails every Attendee registration its rating link.
export function sendRatingLinks(
  eventId: number | string,
): Promise<{ sent: number }> {
  return v1Request(`/events/${eventId}/rating-links`, { method: "POST" });
}

// Organizer (admin): everyone who has been on stage at least once.
export function getPerformedParticipants(
  eventId: number | string,
): Promise<PerformedParticipant[]> {
  return v1Request(`/events/${eventId}/performed-participants`);
}

// Organizer (admin): each performer's audience average for one round.
export function listRoundRatings(
  eventId: number | string,
  roundId: number | string,
): Promise<RoundRatingSummary[]> {
  return v1Request(`/events/${eventId}/round-ratings`, {
    query: { roundId },
  });
}

// Public and anonymous. `deviceToken` (lib/reactions/device-token.ts) only
// ties one browser's taps together; taps faster than 1/s are dropped by
// the server without an error, so callers can fire and forget.
export function submitReaction(
  eventId: number | string,
  performerId: number | string,
  emoji: string,
  deviceToken: string,
): Promise<void> {
  return v1Request(`/events/${eventId}/reactions`, {
    method: "POST",
    body: { performerId: Number(performerId), emoji, deviceToken },
  });
}
