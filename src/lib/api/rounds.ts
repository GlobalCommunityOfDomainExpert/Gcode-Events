import { v1Request } from "./client";
import type { RoundPayloadItem } from "@/lib/event-draft/payloads";
import type {
  EventRound,
  RoundDecision,
  RoundScore,
} from "@/server/modules/rounds/rounds.schemas";

export type { EventRound, RoundDecision, RoundScore };

// /api/v1 judging rounds. Browser-only; server code calls roundsService.

const roundQuery = (roundId?: number | string) =>
  roundId !== undefined ? { roundId } : undefined;

export function listEventRounds(
  eventId: number | string,
): Promise<EventRound[]> {
  return v1Request(`/events/${eventId}/rounds`);
}

// Organizer (admin): the whole list. Rounds that already have scores,
// decisions or ratings are never deleted.
export function replaceEventRounds(
  eventId: number | string,
  items: RoundPayloadItem[],
): Promise<EventRound[]> {
  return v1Request(`/events/${eventId}/rounds`, { method: "PUT", body: items });
}

// Organizer (admin). notify=false is for backfilling a wildcard entry's
// history through rounds they never competed in (see AddParticipantsPanel)
// — otherwise the shortlist email would fire once per backfilled round.
export function decideRoundStatus(
  participantId: number | string,
  roundId: number | string,
  status: "SHORTLISTED" | "REJECTED",
  notify: boolean = true,
): Promise<void> {
  return v1Request(`/participants/${participantId}/round-decisions`, {
    method: "POST",
    body: { roundId: Number(roundId), status, notify },
  });
}

// Organizers and accepted panelists. Full history; latest wins.
export function listRoundDecisions(
  eventId: number | string,
  roundId?: number | string,
): Promise<RoundDecision[]> {
  return v1Request(`/events/${eventId}/round-decisions`, {
    query: roundQuery(roundId),
  });
}

// Organizers and accepted panelists. Must be within the criterion's max.
export function submitRoundScore(
  participantId: number | string,
  roundId: number | string,
  criterionId: number | string,
  score: number,
): Promise<void> {
  return v1Request(`/participants/${participantId}/round-scores`, {
    method: "POST",
    body: {
      roundId: Number(roundId),
      criterionId: Number(criterionId),
      score,
    },
  });
}

// Organizers and accepted panelists. Full history; latest wins per
// participant and criterion.
export function listRoundScores(
  eventId: number | string,
  roundId?: number | string,
): Promise<RoundScore[]> {
  return v1Request(`/events/${eventId}/round-scores`, {
    query: roundQuery(roundId),
  });
}
