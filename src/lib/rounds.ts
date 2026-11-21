import { EventRound } from "@/lib/event";

// A single shortlist/reject decision for one participant in one round.
// History is append-only (see GCODE_EVENT_ROUND_DECISIONS) — a participant
// can have several of these for the same round over time.
export interface RoundDecision {
  id: string;
  roundId: string;
  participantId: string;
  status: "SHORTLISTED" | "REJECTED";
  decidedOn: string;
}

// Reduces a participant's full decision history for a round down to
// whatever's current — the latest row by decidedOn. undefined -> no decision
// has ever been made for this participant/round pair.
export function currentRoundStatus(
  decisions: RoundDecision[],
  participantId: string,
  roundId: string,
): "SHORTLISTED" | "REJECTED" | undefined {
  const relevant = decisions.filter(
    (d) => d.participantId === participantId && d.roundId === roundId,
  );
  if (relevant.length === 0) return undefined;
  return relevant.reduce((latest, d) =>
    new Date(d.decidedOn) > new Date(latest.decidedOn) ? d : latest,
  ).status;
}

// One judge's score for one participant against one rubric criterion, in one
// round. Append-only like RoundDecision above — the latest *per judge* wins
// (see currentRoundScores below) rather than the latest overall, so one
// judge submitting after another doesn't erase the first judge's score.
export interface RoundScore {
  id: string;
  roundId: string;
  participantId: string;
  criterionId: string;
  score: number;
  scoredBy: string;
  scoredOn: string;
}

// Reduces score history down to each judge's latest score per criterion,
// keyed by (criterionId, scoredBy) — a later submission from judge B no
// longer overwrites judge A's entry, only judge B's own prior one.
function latestPerCriterionAndJudge(
  scores: RoundScore[],
  participantId: string,
  roundId: string,
): RoundScore[] {
  const relevant = scores.filter(
    (s) => s.participantId === participantId && s.roundId === roundId,
  );
  const latest = new Map<string, RoundScore>();
  for (const score of relevant) {
    const key = `${score.criterionId}:${score.scoredBy}`;
    const existing = latest.get(key);
    if (!existing || new Date(score.scoredOn) > new Date(existing.scoredOn)) {
      latest.set(key, score);
    }
  }
  return Array.from(latest.values());
}

// The round's official per-criterion score — every judge's latest score for
// that criterion, averaged. A single scorer (organizer scoring alone, no
// panelists assigned) just gets their own value back, since there's only
// one to average. undefined entries -> no judge has scored that criterion
// yet.
export function currentRoundScores(
  scores: RoundScore[],
  participantId: string,
  roundId: string,
): Record<string, number> {
  const byCriterion = new Map<string, number[]>();
  for (const score of latestPerCriterionAndJudge(
    scores,
    participantId,
    roundId,
  )) {
    const values = byCriterion.get(score.criterionId) ?? [];
    values.push(score.score);
    byCriterion.set(score.criterionId, values);
  }
  return Object.fromEntries(
    Array.from(byCriterion.entries()).map(([criterionId, values]) => [
      criterionId,
      values.reduce((a, b) => a + b, 0) / values.length,
    ]),
  );
}

// One specific judge's own latest score per criterion — what that judge's
// score input should show/edit. Deliberately different from
// currentRoundScores: showing a judge the blended average (rather than
// their own prior entry) in an editable field means blurring without
// changing it would resubmit the average as if it were their own score,
// corrupting the next average.
export function myRoundScores(
  scores: RoundScore[],
  participantId: string,
  roundId: string,
  judgeId: string,
): Record<string, number> {
  const mine = latestPerCriterionAndJudge(
    scores,
    participantId,
    roundId,
  ).filter((s) => s.scoredBy === judgeId);
  return Object.fromEntries(mine.map((s) => [s.criterionId, s.score]));
}

// Each judge's own latest score per criterion, grouped by judge rather than
// averaged — the organizer's live per-panelist breakdown for the current
// performer, as opposed to currentRoundScores' single blended value.
export function scoresByJudge(
  scores: RoundScore[],
  participantId: string,
  roundId: string,
): Record<string, Record<string, number>> {
  const byJudge: Record<string, Record<string, number>> = {};
  for (const score of latestPerCriterionAndJudge(
    scores,
    participantId,
    roundId,
  )) {
    byJudge[score.scoredBy] ??= {};
    byJudge[score.scoredBy][score.criterionId] = score.score;
  }
  return byJudge;
}

// Sums the current (averaged) score for every criterion in `rubric` that's
// been scored so far — partial scoring still shows a running total.
export function totalRubricScore(
  rubric: { id: string }[],
  scores: RoundScore[],
  participantId: string,
  roundId: string,
): number {
  const current = currentRoundScores(scores, participantId, roundId);
  return rubric.reduce((sum, c) => sum + (current[c.id] ?? 0), 0);
}

// True once every criterion has been scored by every expected judge, for
// every participant — the trigger condition for auto-shortlisting.
// `expectedJudgeIds` is normally the event's accepted panelists; pass []
// for single-scorer events (no panelists assigned) to fall back to "any one
// score counts," matching pre-multi-judge behavior.
export function isRoundFullyScored(
  rubric: { id: string }[],
  participantIds: string[],
  scores: RoundScore[],
  roundId: string,
  expectedJudgeIds: string[],
): boolean {
  if (rubric.length === 0 || participantIds.length === 0) return false;
  return participantIds.every((participantId) => {
    const relevant = scores.filter(
      (s) => s.participantId === participantId && s.roundId === roundId,
    );
    return rubric.every((criterion) => {
      const judged = new Set(
        relevant
          .filter((s) => s.criterionId === criterion.id)
          .map((s) => s.scoredBy),
      );
      return expectedJudgeIds.length === 0
        ? judged.size > 0
        : expectedJudgeIds.every((id) => judged.has(id));
    });
  });
}

// True once every participant has a Shortlist/Reject decision for the round
// — the gate for unlocking the next round in sequence.
export function isRoundDecided(
  participantIds: string[],
  decisions: RoundDecision[],
  roundId: string,
): boolean {
  if (participantIds.length === 0) return false;
  return participantIds.every(
    (participantId) =>
      currentRoundStatus(decisions, participantId, roundId) !== undefined,
  );
}

// Ranks every participant who has no decision yet by total rubric score
// (ties broken by participant id, ascending, for a deterministic cutoff at
// exactly N) and splits them into the top `shortlistCount` vs the rest.
// Participants who already have a manual decision are left alone entirely —
// this only acts on the undecided, so re-running after a first successful
// pass is a no-op (nothing left undecided) rather than re-litigating calls
// the organizer already made.
export function computeAutoShortlist(
  rubric: { id: string }[],
  participantIds: string[],
  scores: RoundScore[],
  decisions: RoundDecision[],
  roundId: string,
  shortlistCount: number,
): { shortlistIds: string[]; rejectIds: string[] } {
  const undecided = participantIds.filter(
    (participantId) =>
      currentRoundStatus(decisions, participantId, roundId) === undefined,
  );
  const ranked = [...undecided].sort((a, b) => {
    const scoreDiff =
      totalRubricScore(rubric, scores, b, roundId) -
      totalRubricScore(rubric, scores, a, roundId);
    return scoreDiff !== 0 ? scoreDiff : a.localeCompare(b);
  });
  return {
    shortlistIds: ranked.slice(0, shortlistCount),
    rejectIds: ranked.slice(shortlistCount),
  };
}

// The judge rubric total, rescaled to out-of-100 so it's comparable to the
// audience's 0-100 rating average for blending below. undefined -> nobody's
// scored this participant yet, or the round has no rubric — distinct from
// "scored 0," so blendedFinalScore knows to fall back to the other source
// rather than blending in a false zero.
export function judgeScoreOutOf100(
  rubric: { id: string; maxScore: number }[],
  scores: RoundScore[],
  participantId: string,
  roundId: string,
): number | undefined {
  const maxTotal = rubric.reduce((sum, c) => sum + c.maxScore, 0);
  if (maxTotal === 0) return undefined;
  if (
    Object.keys(currentRoundScores(scores, participantId, roundId)).length === 0
  ) {
    return undefined;
  }
  return (
    (totalRubricScore(rubric, scores, participantId, roundId) / maxTotal) * 100
  );
}

// The live final score for one performer — judge average blended with
// audience average per the round's own weight split. Either source missing
// (no judges have scored yet, or Casual mode collects no numeric audience
// score) -> the other source alone, not a false partial blend. Both missing
// -> undefined, no final score concept applies yet.
export function blendedFinalScore(
  round: { judgeWeight: number; audienceWeight: number },
  judgeScore100: number | undefined,
  audienceScore100: number | undefined,
): number | undefined {
  if (judgeScore100 === undefined && audienceScore100 === undefined) {
    return undefined;
  }
  if (judgeScore100 === undefined) return audienceScore100;
  if (audienceScore100 === undefined) return judgeScore100;
  const totalWeight = round.judgeWeight + round.audienceWeight || 1;
  return (
    (round.judgeWeight * judgeScore100 +
      round.audienceWeight * audienceScore100) /
    totalWeight
  );
}

// The one round currently "in progress" — unlocked (the round before it, if
// any, is fully decided) but not yet itself fully decided. Sequential round
// locking (see isRoundDecided) means at most one round in the whole event
// satisfies this at a time. undefined once every round is decided (nothing
// left open) or if the event has no rounds at all.
export function resolveActiveRound(
  rounds: EventRound[],
  decisions: RoundDecision[],
  participantIds: string[],
): EventRound | undefined {
  for (let i = 0; i < rounds.length; i++) {
    const unlocked =
      i === 0 || isRoundDecided(participantIds, decisions, rounds[i - 1].id);
    if (!unlocked) break;
    if (!isRoundDecided(participantIds, decisions, rounds[i].id)) {
      return rounds[i];
    }
  }
  return undefined;
}

// "Offline" is synonymous with "live-judged" — every Offline round uses the
// current-performer/scoreboard/live-judging mechanic, not just the last one.
// The live round is the active round (resolveActiveRound above), if it's
// Offline. Falls back to the last Offline round once every round is decided
// (post-event, still need somewhere for the leaderboard/read-only views to
// point) or when the active round hasn't reached an Offline round yet.
export function resolveLiveRound(
  rounds: EventRound[],
  decisions: RoundDecision[],
  participantIds: string[],
): {
  liveRound: EventRound | undefined;
  previousRound: EventRound | undefined;
} {
  const activeRound = resolveActiveRound(rounds, decisions, participantIds);
  const liveRound =
    activeRound?.mode === "Offline"
      ? activeRound
      : [...rounds].reverse().find((r) => r.mode === "Offline");
  const liveRoundIndex = liveRound
    ? rounds.findIndex((r) => r.id === liveRound.id)
    : -1;
  const previousRound =
    liveRoundIndex > 0 ? rounds[liveRoundIndex - 1] : undefined;
  return { liveRound, previousRound };
}

// Ranks every participant in a round by total rubric score, descending (ties
// broken by participant id, ascending — same convention as
// computeAutoShortlist) — the organizer's read-only rank column.
export function rankByTotalScore(
  rubric: { id: string; maxScore: number }[],
  scores: RoundScore[],
  participantIds: string[],
  roundId: string,
): Record<string, number> {
  const ranked = [...participantIds].sort((a, b) => {
    const diff =
      totalRubricScore(rubric, scores, b, roundId) -
      totalRubricScore(rubric, scores, a, roundId);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
  return Object.fromEntries(ranked.map((id, index) => [id, index + 1]));
}

// Offline rounds' judge/audience scoring are both explicit per-round toggles
// (judgeScoringEnabled/audienceScoringEnabled — see GCODE_EVENT_ROUNDS),
// independent of whether a rubric happens to be saved: an organizer can
// define rubric criteria and then flip judge scoring off without losing
// them. Online rounds have no toggle at all — judge scoring via rubric is
// unconditional there, callers should just check mode === "Online" directly
// rather than calling this. These mirror isRoundFullyScored/
// computeAutoShortlist/rankByTotalScore above but for the audience side.
export function isRoundFullyRated(
  participantIds: string[],
  ratings: { participantId: number; ratingCount: number }[],
): boolean {
  if (participantIds.length === 0) return false;
  const rated = new Set(
    ratings
      .filter((r) => r.ratingCount > 0)
      .map((r) => String(r.participantId)),
  );
  return participantIds.every((id) => rated.has(id));
}

// An Offline round can be judged by panelists (live, via the
// current-performer flow), by the audience (live 0-10 rating), or both —
// whichever the organizer turned on for this round in the edit wizard. True
// once every *active* source has finished for every participant. A source
// that isn't active for this round doesn't block on it -- waiting on a
// rating that will never arrive would leave the round stuck forever.
// Neither active at all -> always false, there's nothing to auto-decide on
// (that round stays fully manual, no rank to go by).
export function isRoundFullyJudged(
  rubric: { id: string }[],
  participantIds: string[],
  scores: RoundScore[],
  ratings: { participantId: number; ratingCount: number }[],
  roundId: string,
  expectedJudgeIds: string[],
  judgeActive: boolean,
  audienceActive: boolean,
): boolean {
  if (!judgeActive && !audienceActive) return false;
  if (
    judgeActive &&
    !isRoundFullyScored(
      rubric,
      participantIds,
      scores,
      roundId,
      expectedJudgeIds,
    )
  ) {
    return false;
  }
  if (audienceActive && !isRoundFullyRated(participantIds, ratings)) {
    return false;
  }
  return true;
}

// Ranks every participant by blendedFinalScore (judge rubric + audience
// rating per the round's own weight split — falls back to whichever single
// source is actually in play, same as the live panel's leaderboard). Ties
// (including "nobody's scored this participant from either source yet",
// treated as the lowest rank) broken by participant id, same convention as
// every other rank/shortlist helper here.
export function rankByBlendedScore(
  round: { judgeWeight: number; audienceWeight: number },
  rubric: { id: string; maxScore: number }[],
  scores: RoundScore[],
  ratings: { participantId: number; avgRating: number }[],
  participantIds: string[],
  roundId: string,
): Record<string, number> {
  const ratingByParticipant = new Map(
    ratings.map((r) => [String(r.participantId), r.avgRating]),
  );
  const scoreFor = (participantId: string) =>
    blendedFinalScore(
      round,
      judgeScoreOutOf100(rubric, scores, participantId, roundId),
      ratingByParticipant.get(participantId),
    ) ?? -1;
  const ranked = [...participantIds].sort((a, b) => {
    const diff = scoreFor(b) - scoreFor(a);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
  return Object.fromEntries(ranked.map((id, index) => [id, index + 1]));
}

// Same undecided-only/deterministic-tiebreak shape as computeAutoShortlist
// above, but ranks by blendedFinalScore instead of rubric total alone — the
// Offline-round auto-decide path, fired only once isRoundFullyJudged says
// every active source (judge, audience, or both) has finished.
export function computeAutoShortlistBlended(
  round: { judgeWeight: number; audienceWeight: number },
  rubric: { id: string; maxScore: number }[],
  participantIds: string[],
  scores: RoundScore[],
  ratings: { participantId: number; avgRating: number }[],
  decisions: RoundDecision[],
  roundId: string,
  shortlistCount: number,
): { shortlistIds: string[]; rejectIds: string[] } {
  const ratingByParticipant = new Map(
    ratings.map((r) => [String(r.participantId), r.avgRating]),
  );
  const scoreFor = (participantId: string) =>
    blendedFinalScore(
      round,
      judgeScoreOutOf100(rubric, scores, participantId, roundId),
      ratingByParticipant.get(participantId),
    ) ?? -1;
  const undecided = participantIds.filter(
    (participantId) =>
      currentRoundStatus(decisions, participantId, roundId) === undefined,
  );
  const ranked = [...undecided].sort((a, b) => {
    const diff = scoreFor(b) - scoreFor(a);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
  return {
    shortlistIds: ranked.slice(0, shortlistCount),
    rejectIds: ranked.slice(shortlistCount),
  };
}
