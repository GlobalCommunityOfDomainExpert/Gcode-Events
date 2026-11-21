import "server-only";
import type { SessionUser } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";
import { eventsRepository } from "@/server/modules/events/events.repository";
import { assertEventStaff } from "@/server/modules/panelists/panelists.service";
import { participantsRepository } from "@/server/modules/participants/participants.repository";
import {
  roundsRepository as repo,
  type DecisionRow,
  type RoundRow,
  type ScoreRow,
} from "./rounds.repository";
import type {
  DecideRoundBody,
  DecisionStatus,
  EventRound,
  ReplaceRoundsBody,
  RoundCriterion,
  RoundDecision,
  RoundScore,
  ScoreRoundBody,
} from "./rounds.schemas";

function parseRubric(json: string | null): RoundCriterion[] {
  if (!json) return [];
  try {
    const items = JSON.parse(json) as {
      id: number;
      round_id: number;
      sort_order: number;
      label: string;
      max_score: number;
    }[];
    return items.map((c) => ({
      id: c.id,
      roundId: c.round_id,
      sortOrder: c.sort_order,
      label: c.label,
      maxScore: c.max_score,
    }));
  } catch {
    return [];
  }
}

export function toEventRound(row: RoundRow): EventRound {
  return {
    id: row.id,
    eventId: row.event_id,
    sortOrder: row.sort_order,
    name: row.name,
    description: row.description,
    mode: row.mode === "OFFLINE" ? "OFFLINE" : "ONLINE",
    rubric: parseRubric(row.rubric),
    shortlistCount: null,
    startTime: row.start_time?.toISOString() ?? null,
    endTime: row.end_time?.toISOString() ?? null,
    judgeWeight: row.judge_weight,
    audienceWeight: row.audience_weight,
    judgeScoringEnabled: row.judge_scoring_enabled === "Y",
    audienceScoringEnabled: row.audience_scoring_enabled === "Y",
  };
}

function toDecision(row: DecisionRow): RoundDecision {
  return {
    id: row.id,
    roundId: row.round_id,
    participantId: row.participant_id,
    status: row.status as DecisionStatus,
    decidedBy: row.decided_by,
    decidedOn: row.decided_on.toISOString(),
  };
}

function toScore(row: ScoreRow): RoundScore {
  return {
    id: row.id,
    roundId: row.round_id,
    participantId: row.participant_id,
    criterionId: row.criterion_id,
    score: row.score,
    scoredBy: row.scored_by,
    scoredOn: row.scored_on.toISOString(),
  };
}

async function assertEventExists(eventId: number) {
  if (!(await eventsRepository.exists(eventId)))
    throw AppError.notFound("Event");
}

// The package checks none of this: the participant, the round and (for a
// score) the criterion must all belong to the same event.
async function loadContext(participantId: number, roundId: number) {
  const participant = await participantsRepository.getById(participantId);
  if (!participant) throw AppError.notFound("Registration");
  const round = (await repo.listRounds(participant.event_id)).find(
    (r) => r.id === roundId,
  );
  if (!round) throw AppError.badRequest("That round isn't part of this event.");
  return { participant, round: toEventRound(round) };
}

export const roundsService = {
  async list(eventId: number) {
    return (await repo.listRounds(eventId)).map(toEventRound);
  },

  async replace(eventId: number, body: ReplaceRoundsBody) {
    await assertEventExists(eventId);
    await repo.replaceRounds(eventId, JSON.stringify(body));
    return this.list(eventId);
  },

  async decisions(eventId: number, roundId: number | null, user: SessionUser) {
    await assertEventStaff(eventId, user);
    return (await repo.listDecisions(eventId, roundId)).map(toDecision);
  },

  // Organizer only (admin route). Shortlisting emails the participant
  // unless notify is false.
  async decide(
    participantId: number,
    body: DecideRoundBody,
    user: SessionUser,
  ) {
    const { participant } = await loadContext(participantId, body.roundId);
    if (participant.category !== "PARTICIPANT") {
      throw AppError.badRequest(
        "Only Participant-category entries go through rounds.",
      );
    }
    await repo.decide({
      roundId: body.roundId,
      participantId,
      status: body.status,
      decidedBy: user.userId,
      notify: body.notify,
    });
  },

  async scores(eventId: number, roundId: number | null, user: SessionUser) {
    await assertEventStaff(eventId, user);
    return (await repo.listScores(eventId, roundId)).map(toScore);
  },

  // Organizers and the event's accepted panelists.
  async score(participantId: number, body: ScoreRoundBody, user: SessionUser) {
    const { participant, round } = await loadContext(
      participantId,
      body.roundId,
    );
    await assertEventStaff(participant.event_id, user);
    if (participant.category !== "PARTICIPANT") {
      throw AppError.badRequest(
        "Only Participant-category entries can be scored.",
      );
    }
    const criterion = round.rubric.find((c) => c.id === body.criterionId);
    if (!criterion) {
      throw AppError.badRequest("That criterion isn't part of this round.");
    }
    if (body.score > criterion.maxScore) {
      throw AppError.badRequest(
        `${criterion.label} is scored out of ${criterion.maxScore}.`,
      );
    }
    await repo.submitScore({
      roundId: body.roundId,
      criterionId: body.criterionId,
      participantId,
      score: body.score,
      scoredBy: user.userId,
    });
  },
};
