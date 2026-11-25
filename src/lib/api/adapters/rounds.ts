// Judging rounds, rubrics, decisions and scores.

import { EventRound } from "@/lib/event";
import { RoundDecision, RoundScore } from "@/lib/rounds";
import { EventDetailData } from "@/lib/zod/event";
import type {
  EventRound as EventRoundDto,
  RoundDecision as RoundDecisionDto,
  RoundScore as RoundScoreDto,
} from "@/server/modules/rounds/rounds.schemas";
import { resolveRoundMode } from "./codes";
import { istDate, istTime } from "@/lib/datetime/ist";

// Round -> UI round item.
export function adaptEventRound(row: EventRoundDto): EventRound {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description ?? "",
    mode: resolveRoundMode(row.mode),
    rubric: row.rubric.map((r) => ({
      id: String(r.id),
      label: r.label,
      maxScore: r.maxScore,
    })),
    shortlistCount: row.shortlistCount ?? 0,
    startTime: row.startTime,
    endTime: row.endTime,
    sortOrder: row.sortOrder,
    judgeWeight: row.judgeWeight,
    audienceWeight: row.audienceWeight,
    judgeScoringEnabled: row.judgeScoringEnabled,
    audienceScoringEnabled: row.audienceScoringEnabled,
  };
}

// Decision history row -> UI decision item.
export function adaptRoundDecision(row: RoundDecisionDto): RoundDecision {
  return {
    id: String(row.id),
    roundId: String(row.roundId),
    participantId: String(row.participantId),
    status: row.status,
    decidedOn: row.decidedOn,
  };
}

// Score history row -> UI score item.
export function adaptRoundScore(row: RoundScoreDto): RoundScore {
  return {
    id: String(row.id),
    roundId: String(row.roundId),
    participantId: String(row.participantId),
    criterionId: String(row.criterionId),
    score: row.score,
    scoredBy: row.scoredBy ?? "",
    scoredOn: row.scoredOn,
  };
}

// GCODE_EVENT_ROUNDS rows -> the editable round form shape (RoundsEditor).
// Used by the dashboard's Rounds page, which owns round configuration. Same
// mapping toEventDraft applies to its `rounds` argument, except that a round
// with only an end (e.g. "results by 26 Nov") still gets a day.
export function toRoundsDraft(
  rounds: EventRoundDto[],
): EventDetailData["rounds"] {
  return rounds.map((row) => {
    const item = adaptEventRound(row);
    return {
      id: row.id,
      name: item.name,
      description: item.description,
      mode: row.mode,
      rubric: item.rubric.map((c) => ({
        id: Number(c.id),
        label: c.label,
        maxScore: c.maxScore,
      })),
      shortlistCount: item.shortlistCount ?? 0,
      date: item.startTime
        ? istDate(item.startTime)
        : item.endTime
          ? istDate(item.endTime)
          : "",
      startTime: item.startTime ? istTime(item.startTime) : "",
      endTime: item.endTime ? istTime(item.endTime) : "",
      judgeWeight: item.judgeWeight,
      audienceWeight: item.audienceWeight,
      judgeScoringEnabled: item.judgeScoringEnabled,
      audienceScoringEnabled: item.audienceScoringEnabled,
    };
  });
}
