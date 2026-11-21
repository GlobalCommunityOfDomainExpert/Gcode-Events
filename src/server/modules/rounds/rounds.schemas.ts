import { z } from "zod";

// API contract for judging rounds, their rubrics, shortlist decisions and
// judge scores. Shared with src/lib/api/rounds.ts.
//
// Decisions and scores are append-only histories: the latest row per
// participant (per criterion, for scores) wins.

export interface RoundCriterion {
  id: number;
  roundId: number;
  sortOrder: number;
  label: string;
  maxScore: number;
}

export interface EventRound {
  id: number;
  eventId: number;
  sortOrder: number;
  name: string;
  description: string | null;
  mode: "ONLINE" | "OFFLINE";
  rubric: RoundCriterion[];
  // Not stored by GCODE_ROUNDS_API.list_rounds today; always null.
  shortlistCount: number | null;
  startTime: string | null;
  endTime: string | null;
  // Blend of judge rubric average vs audience rating for the live round.
  judgeWeight: number;
  audienceWeight: number;
  judgeScoringEnabled: boolean;
  audienceScoringEnabled: boolean;
}

export type DecisionStatus = "SHORTLISTED" | "REJECTED";

export interface RoundDecision {
  id: number;
  roundId: number;
  participantId: number;
  status: DecisionStatus;
  decidedBy: string | null;
  decidedOn: string;
}

export interface RoundScore {
  id: number;
  roundId: number;
  participantId: number;
  criterionId: number;
  score: number;
  scoredBy: string | null;
  scoredOn: string;
}

const id = z.number().int().positive();

// PUT /api/v1/events/:id/rounds (admin) — the whole list; rounds and
// criteria with an id are updated in place, others created, and ones left
// out deleted unless they already have scores/decisions/ratings.
export const replaceRoundsSchema = z
  .array(
    z.object({
      id: id.nullable(),
      name: z.string().trim().min(1).max(200),
      description: z.string().max(4000),
      mode: z.enum(["ONLINE", "OFFLINE"]),
      rubric: z
        .array(
          z.object({
            id: id.nullable(),
            label: z.string().trim().min(1).max(200),
            maxScore: z.number().positive().max(1000),
          }),
        )
        .max(50),
      shortlistCount: z.number().int().min(0),
      startTime: z.iso.datetime({ offset: true }).nullable(),
      endTime: z.iso.datetime({ offset: true }).nullable(),
      sortOrder: z.number().int().min(0),
      judgeWeight: z.number().min(0).max(100),
      audienceWeight: z.number().min(0).max(100),
      judgeScoringEnabled: z.enum(["Y", "N"]),
      audienceScoringEnabled: z.enum(["Y", "N"]),
    }),
  )
  .max(50);

export type ReplaceRoundsBody = z.infer<typeof replaceRoundsSchema>;

// ?roundId= narrows a history list to one round.
export const roundQuerySchema = z.object({
  roundId: z.coerce.number().int().positive().optional(),
});

// POST /api/v1/participants/:id/round-decisions (admin). notify=false skips
// the shortlist email — for backfilling a wildcard entry's history through
// rounds they never competed in.
export const decideRoundSchema = z.object({
  roundId: id,
  status: z.enum(["SHORTLISTED", "REJECTED"]),
  notify: z.boolean().default(true),
});

export type DecideRoundBody = z.infer<typeof decideRoundSchema>;

// POST /api/v1/participants/:id/round-scores (organizer or an accepted
// panelist of the event). The score must be within the criterion's max.
export const scoreRoundSchema = z.object({
  roundId: id,
  criterionId: id,
  score: z.number().min(0),
});

export type ScoreRoundBody = z.infer<typeof scoreRoundSchema>;
