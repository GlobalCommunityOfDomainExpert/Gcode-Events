import "server-only";
import { AppError } from "@/server/http/errors";
import { eventsRepository } from "@/server/modules/events/events.repository";
import { liveRepository as repo } from "./live.repository";
import type {
  LiveState,
  PerformedParticipant,
  Reaction,
  RoundRatingSummary,
} from "./live.schemas";

async function assertEventExists(eventId: number) {
  if (!(await eventsRepository.exists(eventId)))
    throw AppError.notFound("Event");
}

export const liveService = {
  // Public: the rate page, the scoreboard and the judge page follow this.
  async state(eventId: number, attendeeId?: number): Promise<LiveState> {
    const row = await repo.getState(eventId, attendeeId ?? null);
    return {
      participantId: row.participantId,
      participantName: row.participantName,
      alreadyRated: (row.alreadyRated ?? 0) > 0,
      windowClosesAt: row.windowClosesAt,
      avgRating: row.avgRating,
      ratingCount: row.ratingCount ?? 0,
      roundId: row.roundId,
      isIntermission: row.isIntermission === "Y",
    };
  },

  // Organizer controls (admin routes). Each returns the new state.
  async setPerformer(eventId: number, participantId: number, roundId?: number) {
    await repo.setPerformer(eventId, participantId, roundId ?? null);
    return this.state(eventId);
  },

  async setIntermission(eventId: number, active: boolean) {
    await assertEventExists(eventId);
    await repo.setIntermission(eventId, active);
    return this.state(eventId);
  },

  async startRatingWindow(eventId: number) {
    await repo.startRatingWindow(eventId);
    return this.state(eventId);
  },

  // :attendeeId is the rater's own Attendee registration, from their
  // rating link (the same bearer-link model as ?pid=). The package checks
  // the categories, the event, the open window and one rating each.
  async rate(attendeeId: number, performerId: number, rating: number) {
    const createdOn = await repo.submitRating(attendeeId, performerId, rating);
    return { createdOn: createdOn?.toISOString() ?? null };
  },

  async sendRatingLinks(eventId: number) {
    await assertEventExists(eventId);
    const sent = await repo.countRatingLinkRecipients(eventId);
    await repo.sendRatingLinks(eventId);
    return { sent };
  },

  async performed(eventId: number): Promise<PerformedParticipant[]> {
    return (await repo.performed(eventId)).map((r) => ({
      participantId: r.participant_id,
      performedAt: r.performed_at.toISOString(),
    }));
  },

  async roundRatings(
    eventId: number,
    roundId: number,
  ): Promise<RoundRatingSummary[]> {
    return (await repo.roundRatings(eventId, roundId)).map((r) => ({
      participantId: r.participant_id,
      avgRating: r.avg_rating,
      ratingCount: r.rating_count,
    }));
  },

  async react(input: {
    eventId: number;
    performerId: number;
    emoji: string;
    deviceToken: string;
  }) {
    await repo.submitReaction(input);
  },

  async reactionsSince(
    performerId: number,
    sinceId: number,
  ): Promise<Reaction[]> {
    return (await repo.reactionsSince(performerId, sinceId)).map((r) => ({
      id: r.id,
      emoji: r.emoji,
    }));
  },
};
