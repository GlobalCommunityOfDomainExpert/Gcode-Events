"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  MonitorPlay,
  PlayCircle,
} from "lucide-react";
import { Icon } from "@/components/atoms";
import type { Event } from "@/lib/event";
import { hasLiveRoom } from "@/lib/live-room";
import { OPENS_BEFORE_MIN } from "@/lib/webinar";
import { useLiveAccess } from "@/hooks/use-live-access";

// The way into an online event's live room (/<id>/live), for people
// who are attending. Follows the server's session state: opens-at → live now →
// replay. Attending is the viewer's real registration, never a switch.
export function LiveRoomCard({
  event,
  emphasis = false,
}: {
  event: Event;
  /** Larger, primary-styled version for the post-booking page. */
  emphasis?: boolean;
}) {
  const room = hasLiveRoom(event);
  const access = useLiveAccess(event.id, room);
  if (!room) return null;
  // Only people with a ticket see the way in.
  if (!access?.registered) return null;
  const webinarTime =
    access.state === "ENDED"
      ? "ended"
      : access.state === "OPEN" && access.live
        ? "live"
        : access.state === "EARLY"
          ? "before"
          : "doors";

  const opens = event.startDateIso
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(
        new Date(
          new Date(event.startDateIso).getTime() -
            OPENS_BEFORE_MIN.attendee * 60_000,
        ),
      )
    : "closer to the date";

  const live = webinarTime === "live" || webinarTime === "doors";
  const ended = webinarTime === "ended";
  const title = ended
    ? "Replay available"
    : live
      ? webinarTime === "live"
        ? "Live now"
        : "Doors are open"
      : "You're attending";
  const sub = ended
    ? "Watch the recording and grab the slides"
    : live
      ? "Join from here — no meeting link needed"
      : `Live room opens ${opens}`;
  const cta = ended
    ? "Watch replay"
    : live
      ? "Join now"
      : emphasis
        ? "Go to live room"
        : "Open";
  const strong = emphasis || live;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border shadow-sm ${strong ? "bg-primary border-transparent p-5 text-white" : "border-border-light bg-surface-light p-4"}`}
    >
      <span
        className={`relative flex size-10 shrink-0 items-center justify-center rounded-full ${strong ? "bg-white/15" : "bg-success-light text-success"}`}
      >
        <Icon
          icon={ended ? PlayCircle : live ? MonitorPlay : CheckCircle2}
          size="sm"
        />
        {webinarTime === "live" && (
          <span className="bg-secondary absolute -top-0.5 -right-0.5 size-3 animate-pulse rounded-full ring-2 ring-[var(--color-primary)]" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-body font-semibold ${strong ? "text-white" : "text-text-primary"}`}
        >
          {title}
        </p>
        <p
          className={`text-small ${strong ? "text-white/70" : "text-text-secondary"}`}
        >
          {sub}
        </p>
      </div>
      <Link
        href={`/${event.id}/live`}
        className={`text-small inline-flex shrink-0 items-center gap-1 rounded-sm font-semibold ${strong ? "bg-white px-3 py-2 text-[#0b1220] hover:bg-white/90" : "text-primary hover:underline"}`}
      >
        {cta}
        <Icon icon={ArrowRight} size="sm" className="size-4" />
      </Link>
    </div>
  );
}
