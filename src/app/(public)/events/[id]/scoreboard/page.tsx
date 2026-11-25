"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Mic } from "lucide-react";
import { Card, Icon, Progress } from "@/components/atoms";
import { ScoreboardSkeleton } from "@/components/molecules";
import { useEvent } from "@/hooks/use-event";
import {
  LivePerformer,
  liveStateStreamUrl,
  reactionsStreamUrl,
} from "@/lib/api/ratings";
import Image from "next/image";
interface FloatingEmoji {
  key: string;
  emoji: string;
  left: number;
  size: number;
  rotate: number;
  duration: number;
}

interface ReactionBatch {
  performerParticipantId: number;
  items: { id: number; emoji: string }[];
  bots: { emoji: string }[];
}

const MAX_ON_SCREEN_EMOJI = 15;

// Public big-screen display — no attendee identity needed, just shows
// whoever the organizer has marked as currently performing plus their live
// score. Same SSE stream as the rate page, just without an attendee_id (so
// `alreadyRated` on the payload is meaningless here and ignored).
export default function ScoreboardPage() {
  const params = useParams<{ id: string }>();
  const { event } = useEvent(params.id);
  const [live, setLive] = useState<LivePerformer | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [floaters, setFloaters] = useState<FloatingEmoji[]>([]);
  // Mirrors `floaters` synchronously so the capacity check below can read
  // the current count without going through a state-updater callback (state
  // updaters can run more than once and shouldn't schedule side effects like
  // setTimeout).
  const floatersCountRef = useRef(0);

  useEffect(() => {
    if (!params.id) return;
    const source = new EventSource(liveStateStreamUrl(params.id));
    source.onmessage = (e) => {
      const data: LivePerformer = JSON.parse(e.data);
      setLive(data);
    };
    return () => source.close();
  }, [params.id]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (event?.ratingMode !== "Casual" || !live?.participantId) return;
    const source = new EventSource(
      reactionsStreamUrl(params.id, live.participantId),
    );
    source.onmessage = (e) => {
      const data: ReactionBatch = JSON.parse(e.data);
      const incoming = [...data.items, ...data.bots];
      const spawned: FloatingEmoji[] = incoming.map((r) => ({
        key: `${Date.now()}-${Math.random()}`,
        emoji: r.emoji,
        left: 5 + Math.random() * 90,
        size: 24 + Math.random() * 24,
        rotate: -20 + Math.random() * 40,
        duration: 4500 + Math.random() * 2000,
      }));
      // Cap simultaneous on-screen emoji at 10 — real and bot reactions
      // share this same limit. Only admit as many new ones as there's room
      // for; never evict already-animating floaters to make room, or a big
      // burst (bots can spike well past 10/tick) yanks mid-flight emoji off
      // screen almost immediately instead of letting them finish rising.
      const room = Math.max(0, MAX_ON_SCREEN_EMOJI - floatersCountRef.current);
      const admitted = spawned.slice(0, room);
      if (admitted.length === 0) return;

      floatersCountRef.current += admitted.length;
      setFloaters((prev) => [...prev, ...admitted]);
      admitted.forEach((f) => {
        setTimeout(() => {
          floatersCountRef.current -= 1;
          setFloaters((cur) => cur.filter((x) => x.key !== f.key));
        }, f.duration + 100);
      });
    };
    return () => source.close();
  }, [event?.ratingMode, live?.participantId, params.id]);

  if (!event) {
    return <ScoreboardSkeleton />;
  }

  // Intermission — organizer-triggered break. Shows only the logo, nothing
  // else at all (no performer card, no rating UI, no floating reactions),
  // regardless of whatever performer/round state is still set underneath —
  // that state just resumes once intermission ends.
  if (live?.isIntermission) {
    return (
      <div className="fixed inset-0 z-1000 flex items-center justify-center bg-black">
        <Image
          src={"/app-logo.png"}
          width={400}
          height={173}
          alt="logo"
          className="object-contain"
        />
      </div>
    );
  }

  const windowClosesAtMs = live?.windowClosesAt
    ? new Date(live.windowClosesAt).getTime()
    : null;
  const secondsLeft = windowClosesAtMs
    ? Math.max(0, Math.ceil((windowClosesAtMs - now) / 1000))
    : 0;
  // Casual has no expiry at all — once the organizer starts it, reactions
  // stay open until a new performer is selected. Only Competitive's 2-minute
  // window actually closes.
  const windowOpen = live?.participantId
    ? event.ratingMode === "Casual"
      ? !!live.windowClosesAt
      : secondsLeft > 0
    : false;

  return (
    <div className="absolute top-0 right-0 bottom-0 left-0 z-1000 mx-auto flex min-h-[70vh] flex-col items-center justify-center space-y-8 bg-black text-center">
      {event.ratingMode === "Casual" && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          {floaters.map((f) => (
            <span
              key={f.key}
              className="float-emoji absolute bottom-0"
              style={{
                left: `${f.left}%`,
                fontSize: `${f.size}px`,
                ["--rotate" as string]: `${f.rotate}deg`,
                animationDuration: `${f.duration}ms`,
              }}
            >
              {f.emoji}
            </span>
          ))}
        </div>
      )}

      {!live?.participantId ? (
        <Card
          padding="md"
          className="flex flex-col items-center gap-4 px-12 py-10"
        >
          <Icon icon={Mic} size="lg" className="text-text-secondary" />
          <p className="text-heading text-text-secondary">
            Waiting for the next performance…
          </p>
        </Card>
      ) : (
        <Card padding="md" className="w-full space-y-6 px-12 py-10" isDark>
          <div className="space-y-1">
            <p className="text-5xl font-medium tracking-widest text-white uppercase">
              Now Performing
            </p>
            <p className="text-8xl font-extrabold text-amber-500">
              {live.participantName}
            </p>
          </div>

          {event.ratingMode === "Competitive" && (
            <div className="border-border-light border-t pt-6">
              {live.ratingCount > 0 ? (
                <>
                  <p className="text-display text-primary font-extrabold">
                    {live.avgRating?.toFixed(1)}
                    <span className="text-heading text-text-secondary font-semibold">
                      {" "}
                      / 100
                    </span>
                  </p>
                  <Progress
                    value={live.avgRating ?? 0}
                    max={100}
                    label="Average rating"
                    className="mt-3"
                  />
                  <p className="text-small text-text-secondary mt-2">
                    {live.ratingCount} rating
                    {live.ratingCount === 1 ? "" : "s"} so far
                  </p>
                </>
              ) : (
                <p className="text-body text-text-secondary">No ratings yet</p>
              )}
            </div>
          )}

          {event.ratingMode !== "Casual" && (
            <p className="text-small text-text-secondary">
              {windowOpen
                ? `${secondsLeft}s left to rate`
                : "Rating window closed"}
            </p>
          )}
        </Card>
      )}
      <Image
        src={"/app-logo.png"}
        width={200}
        height={87}
        alt="logo"
        className="absolute top-50 left-1/2 -translate-x-1/2 object-contain"
      />
    </div>
  );
}
