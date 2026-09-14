"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, ButtonLink, Select } from "@/components/atoms";
import { Banner, Table, TableColumn } from "@/components/molecules";
import { Attendee } from "@/lib/attendees";
import { Event, EventPanelist, EventRound } from "@/lib/event";
import {
  blendedFinalScore,
  currentRoundStatus,
  judgeScoreOutOf100,
  RoundDecision,
  RoundScore,
  scoresByJudge,
} from "@/lib/rounds";
import { updateEvent } from "@/lib/api/events";
import { listRoundScores } from "@/lib/api/rounds";
import { listEventPanelists } from "@/lib/api/panelists";
import { adaptEventPanelist, adaptRoundScore } from "@/lib/api/adapters";
import {
  getLivePerformer,
  getPerformedParticipants,
  listRoundRatings,
  RoundRatingSummary,
  sendRatingLinks,
  setIntermission,
  setLivePerformer,
  startRatingWindow,
} from "@/lib/api/ratings";
import { ApiError } from "@/lib/api/client";

const LIVE_JUDGING_POLL_MS = 3000;

export interface LiveRoundPanelProps {
  event: Event;
  // Already filtered to category "Participant" — same list the Rounds tab's
  // own decision table uses, passed in rather than refiltered here.
  participants: Attendee[];
  // The round currently selected in the Rounds tab — unlike the old
  // standalone Live tab, this is whichever Offline round the organizer is
  // looking at, not an auto-resolved "current" round.
  round: EventRound;
  previousRound: EventRound | undefined;
  // Event-wide decisions — the Rounds tab already fetches these for its own
  // round-locking check, reused here instead of a second fetch.
  decisions: RoundDecision[];
  // Refetches the parent page's event — needed after the audienceScoringEnabled
  // sync effect below writes a new rating_mode, since that write doesn't
  // otherwise reach this component's own `event` prop (see call site).
  onEventChanged?: () => void;
}

// Extracted from the old standalone "Live" tab (merged into the Rounds tab
// so live rating and round decisions live in one place instead of two tabs
// that had to be cross-referenced). Behavior is otherwise unchanged: current
// performer, audience rating window, live judge/audience/blended scores, and
// the live leaderboard for one specific Offline round.
export function LiveRoundPanel({
  event,
  participants: allParticipants,
  round,
  previousRound,
  decisions,
  onEventChanged,
}: LiveRoundPanelProps) {
  // Only participants Shortlisted in the previous round may perform in this
  // one — matches the old Live tab's eligibility filter. Every round now
  // always produces real decisions (manual Shortlist/Reject is required
  // even with no scoring configured — see the Rounds tab), so this filter
  // no longer needs a casual-round special case.
  const participants = previousRound
    ? allParticipants.filter(
        (p) =>
          currentRoundStatus(decisions, p.id, previousRound.id) ===
          "SHORTLISTED",
      )
    : allParticipants;

  const [currentId, setCurrentId] = useState<string | null>(null);
  // Whether the on-stage performer's audience rating window is currently
  // open — distinct from currentId: bringing someone on stage no longer
  // opens the window by itself, Start Rating does that explicitly.
  const [ratingOpen, setRatingOpen] = useState(false);
  const [performedIds, setPerformedIds] = useState<Set<string>>(new Set());
  const [settingId, setSettingId] = useState<string | null>(null);
  const [startingRating, setStartingRating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [intermission, setIntermissionState] = useState(false);
  const [togglingIntermission, setTogglingIntermission] = useState(false);
  // Whether this round even collects a numeric audience rating — set in the
  // edit wizard (round.audienceScoringEnabled), not toggled live anymore.
  // The public scoreboard's Casual-vs-Competitive display still reads the
  // *event's* persisted ratingMode though (it has no round context), so
  // this effect keeps that in sync with whichever round is active here —
  // same mechanism the old manual toggle used (updateEvent), just driven
  // automatically instead of by a live organizer click.
  const [modeSaving, setModeSaving] = useState(false);
  const syncedRatingModeRef = useRef<string | null>(null);
  useEffect(() => {
    const desired = round.audienceScoringEnabled ? "COMPETITIVE" : "CASUAL";
    const syncKey = `${round.id}:${desired}`;
    if (syncedRatingModeRef.current === syncKey) return;
    if (
      (event.ratingMode === "Competitive" ? "COMPETITIVE" : "CASUAL") ===
      desired
    ) {
      syncedRatingModeRef.current = syncKey;
      return;
    }
    let cancelled = false;
    void (async () => {
      setModeSaving(true);
      try {
        await updateEvent(event.id, { rating_mode: desired });
        if (!cancelled) {
          syncedRatingModeRef.current = syncKey;
          onEventChanged?.();
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError || err instanceof Error
              ? err.message
              : "Couldn't sync rating mode for this round.",
          );
        }
      } finally {
        if (!cancelled) setModeSaving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, round.id, round.audienceScoringEnabled]);
  // "" until the organizer touches the picker — defaults to whoever's
  // already live, falling back to the first participant, without an effect
  // fighting the organizer's own selection once they've made one.
  const [selectedId, setSelectedId] = useState("");
  const effectiveSelectedId =
    selectedId || currentId || participants[0]?.id || "";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const state = await getLivePerformer(event.id);
        if (cancelled) return;
        // ORDS omits the key entirely rather than sending JSON null when no
        // performer is set — state.participant_id comes back `undefined`,
        // not `null`, so both must be treated as "no one on stage."
        if (state.participant_id != null) {
          setCurrentId(String(state.participant_id));
        }
        setRatingOpen(
          !!state.window_closes_at &&
            new Date(state.window_closes_at).getTime() > Date.now(),
        );
        setIntermissionState(state.is_intermission);
      } catch {
        // best-effort — organizer can still set a performer without this
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  async function refreshPerformed() {
    try {
      const items = await getPerformedParticipants(event.id);
      setPerformedIds(new Set(items.map((i) => String(i.participant_id))));
    } catch {
      // best-effort — badge just won't show if this fails
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await getPerformedParticipants(event.id);
        if (!cancelled) {
          setPerformedIds(new Set(items.map((i) => String(i.participant_id))));
        }
      } catch {
        // best-effort — badge just won't show if this fails
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  // Live Judging panel data — panelist scores, live audience average, and
  // the leaderboard all poll together while this round is being viewed.
  const [panelists, setPanelists] = useState<EventPanelist[]>([]);
  const [roundScores, setRoundScores] = useState<RoundScore[]>([]);
  const [roundRatings, setRoundRatings] = useState<RoundRatingSummary[]>([]);
  const [currentAvgRating, setCurrentAvgRating] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const [panelistItems, scoreItems, ratingItems, performerState] =
          await Promise.all([
            listEventPanelists(event.id),
            listRoundScores(event.id, round.id),
            listRoundRatings(event.id, round.id),
            getLivePerformer(event.id),
          ]);
        if (cancelled) return;
        setPanelists(
          panelistItems
            .map(adaptEventPanelist)
            .filter((p) => p.status === "ACCEPTED"),
        );
        setRoundScores(scoreItems.map(adaptRoundScore));
        setRoundRatings(ratingItems);
        setCurrentAvgRating(performerState.avg_rating);
      } catch {
        // best-effort — panel just shows stale/empty data until next tick
      }
    }
    void poll();
    const interval = setInterval(poll, LIVE_JUDGING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [event.id, round.id]);

  const currentJudgeScore100 = currentId
    ? judgeScoreOutOf100(round.rubric, roundScores, currentId, round.id)
    : undefined;
  const currentAudienceScore100 = round.audienceScoringEnabled
    ? (currentAvgRating ?? undefined)
    : undefined;
  const currentBlended = blendedFinalScore(
    round,
    currentJudgeScore100,
    currentAudienceScore100,
  );

  const currentPanelistScores = panelists.map((p) => {
    const perCriterion = currentId
      ? (scoresByJudge(roundScores, currentId, round.id)[p.userId ?? ""] ?? {})
      : {};
    const values = Object.values(perCriterion);
    return {
      panelist: p,
      total: values.length > 0 ? values.reduce((a, b) => a + b, 0) : undefined,
    };
  });

  const leaderboard = useMemo(
    () =>
      Array.from(performedIds)
        .map((participantId) => {
          const participant = allParticipants.find(
            (p) => p.id === participantId,
          );
          const judgeScore100 = judgeScoreOutOf100(
            round.rubric,
            roundScores,
            participantId,
            round.id,
          );
          const audienceScore100 = round.audienceScoringEnabled
            ? roundRatings.find(
                (r) => String(r.participant_id) === participantId,
              )?.avg_rating
            : undefined;
          return {
            participantId,
            name: participant?.name ?? "Unknown",
            final: blendedFinalScore(round, judgeScore100, audienceScore100),
          };
        })
        .sort((a, b) => (b.final ?? -1) - (a.final ?? -1)),
    [performedIds, allParticipants, round, roundScores, roundRatings],
  );

  async function handleSelectPerformer(participantId: string) {
    setSettingId(participantId);
    setError("");
    try {
      await setLivePerformer(event.id, participantId, round.id);
      setCurrentId(participantId);
      // Bringing someone new on stage closes any rating window still open
      // for the previous performer.
      setRatingOpen(false);
      void refreshPerformed();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't update the current performer.",
      );
    } finally {
      setSettingId(null);
    }
  }

  async function handleToggleIntermission() {
    const next = !intermission;
    setTogglingIntermission(true);
    setError("");
    try {
      await setIntermission(event.id, next);
      setIntermissionState(next);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't update intermission.",
      );
    } finally {
      setTogglingIntermission(false);
    }
  }

  async function handleStartRating() {
    setStartingRating(true);
    setError("");
    try {
      await startRatingWindow(event.id);
      setRatingOpen(true);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't start the rating window.",
      );
    } finally {
      setStartingRating(false);
    }
  }

  async function handleSendLinks() {
    if (
      !window.confirm(
        "Email every attendee their unique rating link now? This sends immediately.",
      )
    ) {
      return;
    }
    setSending(true);
    setError("");
    setNotice("");
    try {
      const { sent } = await sendRatingLinks(event.id);
      setNotice(`Sent to ${sent} attendee${sent === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't send rating links.",
      );
    } finally {
      setSending(false);
    }
  }

  // Reactions are anonymous now (no participant/attendee identity involved,
  // see GCODE_RATINGS_API.submit_reaction) — the /rate URL is the same for
  // every viewer, so there's nothing to personalize/email per attendee like
  // sendRatingLinks does for Competitive mode. Just copy the one link.
  async function handleCopyReactionLink() {
    const url = `${window.location.origin}/events/${event.id}/rate`;
    setError("");
    setNotice("");
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Reaction link copied — share it however you like (QR code, screen, chat).");
    } catch {
      setError(`Couldn't copy automatically — here's the link: ${url}`);
    }
  }

  const columns: TableColumn<Attendee>[] = [
    {
      key: "name",
      header: "Participant",
      render: (row) => <span className="text-text-primary">{row.name}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) =>
        currentId === row.id ? (
          <Badge variant="muted" tone="success" size="sm">
            Now performing
          </Badge>
        ) : performedIds.has(row.id) ? (
          <Badge variant="muted" tone="neutral" size="sm">
            Performed
          </Badge>
        ) : null,
    },
  ];

  return (
    <div className="border-border-light space-y-6 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-body text-text-primary font-semibold">
            Live Rating — {round.name}
          </p>
          <p className="text-small text-text-secondary">
            Mark who&apos;s performing now — attendees with a rating link see
            this update live.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Read-only now — judge/audience scoring are set per-round in the
              edit wizard, not toggled live. The badges just reflect
              round.judgeScoringEnabled/audienceScoringEnabled. */}
          <div className={modeSaving ? "flex gap-2 opacity-50" : "flex gap-2"}>
            {round.judgeScoringEnabled && (
              <Badge variant="muted" tone="neutral" size="sm">
                Judge Scoring
              </Badge>
            )}
            {round.audienceScoringEnabled && (
              <Badge variant="muted" tone="neutral" size="sm">
                Audience Scoring
              </Badge>
            )}
            {!round.judgeScoringEnabled && !round.audienceScoringEnabled && (
              <Badge variant="muted" tone="neutral" size="sm">
                No scoring — manual decision
              </Badge>
            )}
          </div>
          <ButtonLink
            href={`/events/${event.id}/scoreboard`}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            size="sm"
          >
            Open Scoreboard
          </ButtonLink>
          <Button
            variant={intermission ? "primary" : "secondary"}
            size="sm"
            disabled={togglingIntermission}
            onClick={handleToggleIntermission}
          >
            {togglingIntermission
              ? "Updating…"
              : intermission
                ? "End Intermission"
                : "Start Intermission"}
          </Button>
          {event.ratingMode === "Casual" ? (
            <Button variant="secondary" size="sm" onClick={handleCopyReactionLink}>
              Copy Reaction Link
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={sending}
              onClick={handleSendLinks}
            >
              {sending ? "Sending…" : "Send Rating Links"}
            </Button>
          )}
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {notice && <Banner tone="success">{notice}</Banner>}
      {previousRound && (
        <Banner tone="info">
          Only participants Shortlisted in &quot;{previousRound.name}&quot; are
          eligible to perform in &quot;{round.name}&quot;.
        </Banner>
      )}

      <div className="border-border-light bg-surface-light flex flex-wrap items-end gap-3 rounded-md border p-4">
        <div className="min-w-48 flex-1 space-y-1">
          <label className="text-small text-text-secondary font-medium">
            Current Performer
          </label>
          <Select
            value={effectiveSelectedId}
            disabled={participants.length === 0 || settingId !== null}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {participants.length === 0 && <option value="">—</option>}
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="secondary"
          disabled={
            !effectiveSelectedId ||
            settingId !== null ||
            effectiveSelectedId === currentId
          }
          onClick={() => handleSelectPerformer(effectiveSelectedId)}
        >
          {settingId === effectiveSelectedId
            ? "Selecting…"
            : effectiveSelectedId === currentId
              ? "On Stage"
              : "Select Performer"}
        </Button>
        {round.audienceScoringEnabled && (
          <Button
            variant="primary"
            disabled={
              !effectiveSelectedId ||
              effectiveSelectedId !== currentId ||
              startingRating ||
              ratingOpen
            }
            onClick={handleStartRating}
          >
            {startingRating
              ? "Starting…"
              : ratingOpen && effectiveSelectedId === currentId
                ? "Rating Open"
                : "Start Rating"}
          </Button>
        )}
      </div>

      <Table
        columns={columns}
        rows={participants}
        rowKey={(row) => row.id}
        emptyState={
          <p className="text-body text-text-secondary p-6 text-center">
            {previousRound
              ? `No one's been Shortlisted from "${previousRound.name}" yet.`
              : "No Participant-category registrations yet."}
          </p>
        }
      />

      {(round.judgeScoringEnabled || round.audienceScoringEnabled) && (
        <div className="border-border-light space-y-4 border-t pt-6">
          <div>
            <p className="text-body text-text-primary font-semibold">
              Live Judging — {round.name}
            </p>
            <p className="text-small text-text-secondary">
              Panelists score the current performer against this round&apos;s
              rubric in real time. Final score blends judge and audience scores{" "}
              {round.judgeWeight}/{round.audienceWeight}.
            </p>
          </div>

          {currentId && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="border-border-light bg-surface-light rounded-md border p-4">
                <p className="text-small text-text-secondary tracking-wide uppercase">
                  Judge Score
                </p>
                <p className="text-heading text-text-primary font-bold">
                  {currentJudgeScore100 !== undefined
                    ? `${currentJudgeScore100.toFixed(1)} / 100`
                    : "—"}
                </p>
              </div>
              <div className="border-border-light bg-surface-light rounded-md border p-4">
                <p className="text-small text-text-secondary tracking-wide uppercase">
                  Audience Score
                </p>
                <p className="text-heading text-text-primary font-bold">
                  {currentAudienceScore100 !== undefined
                    ? `${currentAudienceScore100.toFixed(1)} / 100`
                    : "—"}
                </p>
              </div>
              <div className="border-border-light bg-surface-light rounded-md border p-4">
                <p className="text-small text-text-secondary tracking-wide uppercase">
                  Final Score
                </p>
                <p className="text-heading text-primary font-bold">
                  {currentBlended !== undefined
                    ? `${currentBlended.toFixed(1)} / 100`
                    : "—"}
                </p>
              </div>
            </div>
          )}

          {currentId && panelists.length > 0 && (
            <div className="space-y-2">
              <p className="text-small text-text-secondary font-medium">
                Panelist scores for the current performer
              </p>
              <Table
                columns={[
                  {
                    key: "panelist",
                    header: "Panelist",
                    render: (row: (typeof currentPanelistScores)[number]) => (
                      <span className="text-text-primary">
                        {row.panelist.invitedEmail}
                      </span>
                    ),
                  },
                  {
                    key: "total",
                    header: "Score",
                    render: (row: (typeof currentPanelistScores)[number]) => (
                      <span className="text-text-primary">
                        {row.total !== undefined
                          ? `${row.total} / ${round.rubric.reduce((s, c) => s + c.maxScore, 0)}`
                          : "Not yet scored"}
                      </span>
                    ),
                  },
                ]}
                rows={currentPanelistScores}
                rowKey={(row) => row.panelist.id}
              />
            </div>
          )}

          <div className="space-y-2">
            <p className="text-small text-text-secondary font-medium">
              Live Leaderboard
            </p>
            <Table
              columns={[
                {
                  key: "rank",
                  header: "#",
                  render: (row: (typeof leaderboard)[number]) => (
                    <span className="text-text-secondary">
                      {leaderboard.indexOf(row) + 1}
                    </span>
                  ),
                },
                {
                  key: "name",
                  header: "Participant",
                  render: (row: (typeof leaderboard)[number]) => (
                    <span className="text-text-primary">{row.name}</span>
                  ),
                },
                {
                  key: "final",
                  header: "Final Score",
                  render: (row: (typeof leaderboard)[number]) => (
                    <span className="text-text-primary font-medium">
                      {row.final !== undefined ? row.final.toFixed(1) : "—"}
                    </span>
                  ),
                },
              ]}
              rows={leaderboard}
              rowKey={(row) => row.participantId}
              emptyState={
                <p className="text-body text-text-secondary p-6 text-center">
                  No one has performed yet.
                </p>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
