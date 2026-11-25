"use client";

import { useEffect, useState } from "react";
import { Badge, Input } from "@/components/atoms";
import { Banner, FormField } from "@/components/molecules";
import { Attendee } from "@/lib/attendees";
import { Event, EventRound } from "@/lib/event";
import { myRoundScores, RoundScore } from "@/lib/rounds";
import { listRoundScores, submitRoundScore } from "@/lib/api/rounds";
import { adaptRoundScore } from "@/lib/api/adapters";
import { LivePerformer, liveStateStreamUrl } from "@/lib/api/ratings";
import { useSession } from "@/hooks/use-session";
import { ApiError } from "@/lib/api/client";

export interface LiveJudgeTabProps {
  event: Event;
  attendees: Attendee[];
  // Resolved by the parent page (needs event-wide round decisions to find
  // the lock-chain frontier — see resolveLiveRound in lib/rounds.ts) so this
  // component doesn't need its own decisions fetch just to re-derive it.
  liveRound: EventRound | undefined;
}

// Panelist counterpart to the organizer's Live tab / audience's scoreboard —
// same current-performer mechanic (via the same SSE proxy those two use),
// but scores the performer against the live round's rubric instead of
// rating 0-10. Fields are always-visible (not behind a "Score" button/modal
// like RoundsTab) since there's only ever one participant in view here.
export function LiveJudgeTab({ event, attendees, liveRound }: LiveJudgeTabProps) {
  const session = useSession();
  const [live, setLive] = useState<LivePerformer | null>(null);
  const [scores, setScores] = useState<RoundScore[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!event.id) return;
    const source = new EventSource(liveStateStreamUrl(event.id));
    source.onmessage = (e) => setLive(JSON.parse(e.data));
    return () => source.close();
  }, [event.id]);

  // Trust the live state's own roundId when present (it's authoritative for
  // which round this performance belongs to) — fall back to the locally
  // resolved live round for older live state set before roundId existed.
  const round = live?.roundId
    ? (event.rounds.find((r) => String(r.id) === String(live.roundId)) ??
      liveRound)
    : liveRound;

  const performer =
    live?.participantId != null
      ? attendees.find((a) => a.id === String(live.participantId))
      : undefined;

  async function refreshScores() {
    if (!round) return;
    try {
      const items = await listRoundScores(event.id, round.id);
      setScores(items.map(adaptRoundScore));
    } catch {
      // best-effort — fields just show blank if this fails
    }
  }

  useEffect(() => {
    void refreshScores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, round?.id, live?.participantId]);

  async function submitScore(criterionId: string, maxScore: number, raw: string) {
    if (!performer || !round) return;
    const trimmed = raw.trim();
    if (trimmed === "") {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[criterionId];
        return next;
      });
      return;
    }
    const parsed = Math.max(0, Math.min(maxScore, Number(trimmed)));
    if (Number.isNaN(parsed)) return;
    try {
      await submitRoundScore(performer.id, round.id, criterionId, parsed);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[criterionId];
        return next;
      });
      await refreshScores();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't save that score.",
      );
    }
  }

  if (!round) {
    return (
      <p className="text-body text-text-secondary p-6 text-center">
        No live round configured for this event yet.
      </p>
    );
  }

  if (!performer) {
    return (
      <div className="border-border-light bg-surface-light flex flex-col items-center gap-2 rounded-md border p-10 text-center">
        <p className="text-body text-text-secondary">
          Waiting for the next performer…
        </p>
      </div>
    );
  }

  const mine = session
    ? myRoundScores(scores, performer.id, round.id, session.userId)
    : {};
  const myTotal = Object.values(mine).reduce((sum, v) => sum + v, 0);

  return (
    <div className="space-y-6">
      {error && <Banner tone="danger">{error}</Banner>}

      <div className="border-border-light bg-surface-light rounded-md border p-4">
        <Badge variant="muted" tone="success" size="sm">
          Now performing
        </Badge>
        <p className="text-heading text-text-primary mt-2 font-bold">
          {performer.name}
        </p>
      </div>

      {round.rubric.length === 0 ? (
        <p className="text-body text-text-secondary">
          This round has no scoring rubric configured.
        </p>
      ) : (
        <div className="space-y-4">
          {round.rubric.map((criterion) => {
            const value =
              drafts[criterion.id] ??
              (mine[criterion.id] !== undefined ? String(mine[criterion.id]) : "");
            return (
              <FormField
                key={criterion.id}
                label={`${criterion.label} (out of ${criterion.maxScore})`}
                htmlFor={`live-score-${criterion.id}`}
              >
                <Input
                  id={`live-score-${criterion.id}`}
                  type="number"
                  min={0}
                  max={criterion.maxScore}
                  step={0.1}
                  value={value}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [criterion.id]: event.target.value,
                    }))
                  }
                  onBlur={(event) =>
                    submitScore(criterion.id, criterion.maxScore, event.target.value)
                  }
                />
              </FormField>
            );
          })}
          <p className="text-body text-text-primary border-border-light border-t pt-3 font-medium">
            Your total: {myTotal} /{" "}
            {round.rubric.reduce((sum, c) => sum + c.maxScore, 0)}
          </p>
        </div>
      )}
    </div>
  );
}
