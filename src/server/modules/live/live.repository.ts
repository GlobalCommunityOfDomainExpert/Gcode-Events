import "server-only";
import type { Row } from "@/infrastructure/database";
import { standalone, type DbSource } from "@/server/db/transaction";

// Live state, ratings and reactions through GCODE_RATINGS_API (Phase 1).
// Its writes COMMIT internally except send_rating_links (autocommit).

export type LiveStateRow = {
  participantId: number | null;
  participantName: string | null;
  alreadyRated: number | null;
  windowClosesAt: string | null; // "yyyy-mm-ddThh:mi:ssZ"
  avgRating: number | null;
  ratingCount: number | null;
  roundId: number | null;
  isIntermission: string | null;
};

export function createLiveRepository(source: DbSource = standalone) {
  return {
    async getState(
      eventId: number,
      attendeeId: number | null,
    ): Promise<LiveStateRow> {
      const db = await source();
      return db.call<LiveStateRow>(
        `BEGIN gcode_ratings_api.get_live_state(
           p_event_id => :eventId, p_attendee_id => :attendeeId,
           p_participant_id => :participantId,
           p_participant_name => :participantName,
           p_already_rated => :alreadyRated,
           p_window_closes_at => :windowClosesAt,
           p_avg_rating => :avgRating, p_rating_count => :ratingCount,
           p_round_id => :roundId, p_is_intermission => :isIntermission); END;`,
        {
          eventId,
          attendeeId,
          participantId: { out: "number" },
          participantName: { out: "string" },
          alreadyRated: { out: "number" },
          windowClosesAt: { out: "string" },
          avgRating: { out: "number" },
          ratingCount: { out: "number" },
          roundId: { out: "number" },
          isIntermission: { out: "string" },
        },
      );
    },

    async setPerformer(
      eventId: number,
      participantId: number,
      roundId: number | null,
    ): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_ratings_api.set_current_performer(:eventId, :participantId, :roundId); END;",
        { eventId, participantId, roundId },
      );
    },

    async setIntermission(eventId: number, active: boolean): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_ratings_api.set_intermission(:eventId, :flag); END;",
        { eventId, flag: active ? "Y" : "N" },
      );
    },

    async startRatingWindow(eventId: number): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_ratings_api.start_rating_window(:eventId); END;",
        { eventId },
      );
    },

    async submitRating(
      attendeeId: number,
      performerId: number,
      rating: number,
    ): Promise<Date | null> {
      const db = await source();
      const out = await db.call<{ createdOn: Date | null }>(
        `BEGIN gcode_ratings_api.submit_rating(
           p_attendee_id => :attendeeId, p_performer_id => :performerId,
           p_rating => :rating, p_created_on => :createdOn); END;`,
        { attendeeId, performerId, rating, createdOn: { out: "date" } },
      );
      return out.createdOn;
    },

    // Emails every Attendee registration its rating link.
    async sendRatingLinks(eventId: number): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_ratings_api.send_rating_links(:eventId); END;",
        {
          eventId,
        },
      );
    },

    async countRatingLinkRecipients(eventId: number): Promise<number> {
      const db = await source();
      const row = await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM gcode_event_participants
          WHERE event_id = :eventId AND category = 'ATTENDEE'
            AND user_id IS NOT NULL`,
        { eventId },
      );
      return row?.n ?? 0;
    },

    async performed(
      eventId: number,
    ): Promise<{ participant_id: number; performed_at: Date }[]> {
      const db = await source();
      const { rows } = await db.query<{
        participant_id: number;
        performed_at: Date;
      }>(
        `SELECT id AS participant_id, performed_at
           FROM gcode_event_participants
          WHERE event_id = :eventId AND performed_at IS NOT NULL
          ORDER BY performed_at`,
        { eventId },
      );
      return rows;
    },

    async roundRatings(
      eventId: number,
      roundId: number,
    ): Promise<
      { participant_id: number; avg_rating: number; rating_count: number }[]
    > {
      const db = await source();
      const { rows } = await db.call<{ rows: Row[] }>(
        "BEGIN gcode_ratings_api.list_round_ratings(:eventId, :roundId, :rows); END;",
        { eventId, roundId, rows: { out: "cursor" } },
      );
      return rows as {
        participant_id: number;
        avg_rating: number;
        rating_count: number;
      }[];
    },

    // Throttled to 1 per device per second; faster taps are dropped
    // silently by the package.
    async submitReaction(input: {
      eventId: number;
      performerId: number;
      emoji: string;
      deviceToken: string;
    }): Promise<void> {
      const db = await source();
      await db.call(
        `BEGIN gcode_ratings_api.submit_reaction(
           p_event_id => :eventId, p_performer_participant_id => :performerId,
           p_emoji => :emoji, p_device_token => :deviceToken); END;`,
        input,
      );
    },

    async reactionsSince(
      performerId: number,
      sinceId: number,
    ): Promise<{ id: number; emoji: string }[]> {
      const db = await source();
      const { rows } = await db.call<{ rows: Row[] }>(
        "BEGIN gcode_ratings_api.list_reactions_since(:performerId, :sinceId, 200, :rows); END;",
        { performerId, sinceId, rows: { out: "cursor" } },
      );
      return rows as { id: number; emoji: string }[];
    },
  };
}

export const liveRepository = createLiveRepository();
