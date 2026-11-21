import "server-only";
import type { Row } from "@/infrastructure/database";
import { standalone, type DbSource } from "@/server/db/transaction";

// Rounds through GCODE_ROUNDS_API (Phase 1). Its procedures don't commit:
// standalone calls rely on autocommit, and replace_rounds can join the event
// save's transaction. The list functions return cursors.

export type RoundRow = {
  id: number;
  event_id: number;
  sort_order: number;
  name: string;
  description: string | null;
  mode: string;
  start_time: Date | null;
  end_time: Date | null;
  judge_weight: number;
  audience_weight: number;
  judge_scoring_enabled: string | null;
  audience_scoring_enabled: string | null;
  rubric: string | null; // JSON array (JSON_ARRAYAGG … RETURNING CLOB)
};

export type DecisionRow = {
  id: number;
  round_id: number;
  participant_id: number;
  status: string;
  decided_by: string | null;
  decided_on: Date;
};

export type ScoreRow = {
  id: number;
  round_id: number;
  participant_id: number;
  criterion_id: number;
  score: number;
  scored_by: string | null;
  scored_on: Date;
};

export function createRoundsRepository(source: DbSource = standalone) {
  async function cursor(sql: string, binds: Record<string, number | null>) {
    const db = await source();
    const { rows } = await db.call<{ rows: Row[] }>(sql, {
      ...binds,
      rows: { out: "cursor" },
    });
    return rows;
  }

  return {
    async listRounds(eventId: number): Promise<RoundRow[]> {
      return (await cursor(
        "BEGIN :rows := gcode_rounds_api.list_rounds(:eventId); END;",
        { eventId },
      )) as RoundRow[];
    },

    async replaceRounds(eventId: number, items: string): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_rounds_api.replace_rounds(:eventId, :items); END;",
        { eventId, items },
      );
    },

    async listDecisions(
      eventId: number,
      roundId: number | null,
    ): Promise<DecisionRow[]> {
      return (await cursor(
        "BEGIN :rows := gcode_rounds_api.list_round_decisions(:eventId, :roundId); END;",
        { eventId, roundId },
      )) as DecisionRow[];
    },

    async decide(input: {
      roundId: number;
      participantId: number;
      status: string;
      decidedBy: string;
      notify: boolean;
    }): Promise<void> {
      const db = await source();
      await db.call(
        `BEGIN gcode_rounds_api.decide_round_status(
           p_round_id => :roundId, p_participant_id => :participantId,
           p_status => :status, p_decided_by => :decidedBy,
           p_notify => :notify); END;`,
        { ...input, notify: input.notify ? "Y" : "N" },
      );
    },

    async listScores(
      eventId: number,
      roundId: number | null,
    ): Promise<ScoreRow[]> {
      return (await cursor(
        "BEGIN :rows := gcode_rounds_api.list_round_scores(:eventId, :roundId); END;",
        { eventId, roundId },
      )) as ScoreRow[];
    },

    async submitScore(input: {
      roundId: number;
      criterionId: number;
      participantId: number;
      score: number;
      scoredBy: string;
    }): Promise<void> {
      const db = await source();
      await db.call(
        `BEGIN gcode_rounds_api.submit_round_score(
           p_round_id => :roundId, p_criterion_id => :criterionId,
           p_participant_id => :participantId, p_score => :score,
           p_scored_by => :scoredBy); END;`,
        input,
      );
    },
  };
}

export const roundsRepository = createRoundsRepository();
