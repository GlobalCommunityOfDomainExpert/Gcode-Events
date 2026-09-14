"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AlertTriangle, Check, Compass, Mic } from "lucide-react";
import { Button, Card, Icon } from "@/components/atoms";
import { Banner, NotFoundState } from "@/components/molecules";
import { useEvent } from "@/hooks/use-event";
import { getParticipant } from "@/lib/api/participants";
import {
  getLivePerformer,
  LivePerformer,
  REACTION_EMOJIS,
  submitRating,
  submitReaction,
} from "@/lib/api/ratings";
import { ApiError } from "@/lib/api/client";
import { ParticipantApi } from "@/lib/api/types";
import { getDeviceToken } from "@/lib/reactions/device-token";

// Client-side cooldown after any emoji tap, on top of the server's own
// 1s-per-device throttle (GCODE_RATINGS_API.submit_reaction) — the server
// throttle is what actually prevents spam (a scripted client would just
// skip client code entirely), this is just immediate visual feedback so a
// real person doesn't see their next few taps silently dropped.
const REACTION_COOLDOWN_MS = 1000;

export default function RateEventPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const attendeeId = searchParams.get("aid");
  const { event } = useEvent(params.id);

  const [attendee, setAttendee] = useState<ParticipantApi | undefined>();
  const [attendeeStatus, setAttendeeStatus] = useState<
    "loading" | "error" | "ready"
  >(attendeeId ? "loading" : "error");

  const [live, setLive] = useState<LivePerformer | null>(null);
  const [rating, setRating] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reactionCooldown, setReactionCooldown] = useState(false);
  const deviceTokenRef = useRef<string | null>(null);
  // Re-renders every second so the countdown stays live without waiting on
  // the next SSE message.
  const [now, setNow] = useState(() => Date.now());

  // Reactions (Casual mode) are fully anonymous — no rating link needed at
  // all. Only numeric scoring (Competitive mode) is still tied to a real
  // Attendee registration, since audience *scoring* stays registered-users-only.
  const requiresAttendee = event?.ratingMode !== "Casual";

  useEffect(() => {
    if (!attendeeId) return;
    let cancelled = false;
    void (async () => {
      try {
        const row = await getParticipant(attendeeId);
        if (cancelled) return;
        if (!row) {
          setAttendeeStatus("error");
          return;
        }
        setAttendee(row);
        setAttendeeStatus("ready");
      } catch {
        if (!cancelled) setAttendeeStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attendeeId]);

  useEffect(() => {
    if (!params.id || !event) return;
    // Anonymous (Casual) viewers subscribe with no attendee_id at all —
    // already_rated just stays meaningless/unused for them, everything else
    // about the live-performer state is public.
    const query =
      requiresAttendee && attendeeId ? `?attendee_id=${attendeeId}` : "";
    const source = new EventSource(
      `/api/events/${params.id}/live-performer/stream${query}`,
    );
    source.onmessage = (e) => {
      const data: LivePerformer = JSON.parse(e.data);
      setLive(data);
      setRating(5);
    };
    return () => source.close();
  }, [attendeeId, params.id, event, requiresAttendee]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!event || (requiresAttendee && attendeeStatus === "loading")) {
    return (
      <NotFoundState
        icon={Compass}
        title="Loading…"
        description="Fetching your rating link."
        actionHref="/events"
        actionLabel="Browse Events"
      />
    );
  }

  if (requiresAttendee && (attendeeStatus === "error" || !attendee)) {
    return (
      <NotFoundState
        icon={Compass}
        title="Link not found"
        description="We couldn't find this rating link. Check the link from your email."
        actionHref={`/events/${event.id}`}
        actionLabel="Back to Event"
      />
    );
  }

  if (requiresAttendee && attendee?.category === "PARTICIPANT") {
    return (
      <NotFoundState
        icon={Compass}
        title="Nothing to rate"
        description="Rating is only available for Attendee-category registrations."
        actionHref={`/events/${event.id}`}
        actionLabel="Back to Event"
      />
    );
  }

  const windowClosesAtMs = live?.window_closes_at
    ? new Date(live.window_closes_at).getTime()
    : null;
  const secondsLeft = windowClosesAtMs
    ? Math.max(0, Math.ceil((windowClosesAtMs - now) / 1000))
    : 0;
  // On stage but the organizer hasn't hit Start Rating yet — distinct from
  // windowClosed below, which only applies once a window has actually opened
  // and expired. Without this split, a performer who's merely on stage reads
  // as "rating window closed", which is wrong — it never opened. Competitive
  // only: reactions (Casual) are anonymous and don't have a "window" concept
  // at all — the organizer's Live tab doesn't even show a Start Rating
  // button for Casual rounds (see live-round-panel.tsx), so gating on
  // window_closes_at here would leave reactions permanently unreachable.
  const ratingNotStarted =
    event.ratingMode === "Competitive" &&
    !!live?.participant_id &&
    !live?.window_closes_at;
  // Casual never expires — once started, reactions stay open until a new
  // performer is selected. Only Competitive's 2-minute window actually closes.
  const windowClosed =
    event.ratingMode === "Competitive" &&
    !!live?.participant_id &&
    !!live?.window_closes_at &&
    secondsLeft <= 0;

  async function handleSubmit() {
    if (!live?.participant_id || !attendeeId) return;
    setSubmitting(true);
    setError("");
    try {
      await submitRating(attendeeId, live.participant_id, rating);
      setLive({ ...live, already_rated: true });
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't save your rating. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleReactionTap(emoji: string) {
    if (!live?.participant_id || reactionCooldown) return;
    deviceTokenRef.current ??= getDeviceToken();
    void submitReaction(
      event!.id,
      live.participant_id,
      emoji,
      deviceTokenRef.current,
    );
    setReactionCooldown(true);
    setTimeout(() => setReactionCooldown(false), REACTION_COOLDOWN_MS);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-large text-text-primary font-bold">
          Live Rating — {event.title}
        </h1>
        <p className="text-small text-text-secondary">
          {event.ratingMode === "Casual"
            ? "Tap an emoji to react as it happens — tap as many times as you like."
            : "Rate each performance from 0–10 as it happens. Once submitted, a rating is locked in."}
        </p>
      </div>

      {!live?.participant_id ? (
        <Card padding="md" className="flex items-center gap-4">
          <div className="bg-border-light flex size-10 shrink-0 items-center justify-center rounded-full">
            <Icon icon={Mic} size="md" className="text-text-secondary" />
          </div>
          <p className="text-body text-text-secondary">
            Waiting for the organizer to start the next performance…
          </p>
        </Card>
      ) : (
        <Card padding="md" className="space-y-5">
          <div>
            <p className="text-small text-text-secondary font-medium tracking-wide uppercase">
              Now performing
            </p>
            <p className="text-heading text-text-primary font-extrabold">
              {live.participant_name}
            </p>
          </div>

          {error && <Banner tone="danger">{error}</Banner>}

          {ratingNotStarted ? (
            <div className="border-border-light bg-surface-light flex items-center gap-3 rounded-md border p-4">
              <Icon icon={Mic} size="md" className="text-text-secondary shrink-0" />
              <p className="text-body text-text-secondary">
                On stage now — rating opens as soon as the organizer starts it.
              </p>
            </div>
          ) : windowClosed ? (
            <div className="border-border-light bg-surface-light flex items-center gap-3 rounded-md border p-4">
              <Icon
                icon={live.already_rated ? Check : AlertTriangle}
                size="md"
                className={
                  live.already_rated
                    ? "text-success shrink-0"
                    : "text-danger shrink-0"
                }
              />
              <p className="text-body text-text-primary">
                {live.already_rated
                  ? "Rating locked in for this performance."
                  : "Rating window closed — this performance can no longer be rated."}
              </p>
            </div>
          ) : event.ratingMode === "Casual" ? (
            <div className="space-y-3">
              <p className="text-small text-warning font-semibold">
                Reactions are live — tap as many times as you like
              </p>
              <div className="flex justify-center gap-3">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    disabled={reactionCooldown}
                    className="text-3xl transition-transform active:scale-90 disabled:opacity-40"
                    onClick={() => handleReactionTap(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : live.already_rated ? (
            <div className="border-border-light bg-surface-light flex items-center gap-3 rounded-md border p-4">
              <Icon icon={Check} size="md" className="text-success shrink-0" />
              <p className="text-body text-text-primary">
                Rating locked in — {secondsLeft}s left in this window.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-small text-warning font-semibold">
                {secondsLeft}s left to rate
              </p>
              <div className="flex items-baseline justify-between">
                <p className="text-small text-text-secondary">Your rating</p>
                <p className="text-heading text-text-primary font-extrabold">
                  {rating.toFixed(1)}
                </p>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={rating}
                disabled={submitting}
                onChange={(e) => setRating(Number(e.target.value))}
                className="accent-primary w-full"
              />
              <div className="text-small text-text-secondary flex justify-between">
                <span>0</span>
                <span>10</span>
              </div>
              <Button
                variant="primary"
                className="w-full"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "Saving…" : "Submit Rating"}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
