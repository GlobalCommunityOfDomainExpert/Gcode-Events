"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  FileText,
  Lock,
  PlayCircle,
  RotateCcw,
} from "lucide-react";
import { Icon } from "@/components/atoms";
import type { Event } from "@/lib/event";
import { googleCalendarUrl } from "@/lib/event";
import { serverNow } from "@/lib/server-time";
import { OPENS_BEFORE_MIN, type WebinarRole } from "@/lib/webinar";
import { RoomPanel, btnLight, btnOnDark } from "./room-frame";

/** "3 d 4 h" / "2 h 10 min" / "4 min 12 s" — the advisory room's countdown wording. */
export function useOpensIn(opensAtMs: number) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () =>
      setLeft(
        Math.max(0, Math.floor((opensAtMs - serverNow().getTime()) / 1000)),
      );
    const first = requestAnimationFrame(tick);
    const t = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(t);
    };
  }, [opensAtMs]);
  if (left === null) return "";
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${left % 60} s`;
  return `${left} s`;
}

export const opensAtMs = (event: Event, role: WebinarRole) =>
  event.startDateIso
    ? new Date(event.startDateIso).getTime() - OPENS_BEFORE_MIN[role] * 60_000
    : 0;

function fmtTime(ms: number) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function EarlyScreen({
  event,
  role,
  when,
}: {
  event: Event;
  role: WebinarRole;
  when: string;
}) {
  const at = opensAtMs(event, role);
  const left = useOpensIn(at);
  const cal = googleCalendarUrl(event);
  return (
    <RoomPanel>
      <p className="text-small font-bold tracking-widest text-white/60 uppercase">
        Not open yet
      </p>
      <h1 className="text-display leading-tight font-extrabold">
        The room opens {`${OPENS_BEFORE_MIN[role]} minutes`} before the session
      </h1>
      <p className="text-body text-white/70">
        That&apos;s at {fmtTime(at)} IST. This page opens the lobby by itself
        when it&apos;s time.
      </p>
      <p className="text-display font-extrabold tabular-nums" aria-live="off">
        {left && `Opens in ${left}`}
      </p>
      <p className="text-small text-white/60">{when}</p>
      <div className="flex flex-wrap gap-3 pt-1">
        {cal && (
          <a
            href={cal}
            target="_blank"
            rel="noopener noreferrer"
            className={btnLight}
          >
            <Icon icon={CalendarPlus} size="sm" /> Add to calendar
          </a>
        )}
        <Link href={`/events/${event.id}`} className={btnOnDark}>
          <Icon icon={ArrowLeft} size="sm" /> Back to event
        </Link>
      </div>
    </RoomPanel>
  );
}

export function NotRegisteredScreen({
  event,
  when,
}: {
  event: Event;
  when: string;
}) {
  return (
    <RoomPanel>
      <p className="text-small flex items-center gap-2 font-bold tracking-widest text-white/60 uppercase">
        <Icon icon={Lock} size="sm" className="size-4" /> Registered attendees
        only
      </p>
      <h1 className="text-display leading-tight font-extrabold">
        Get a ticket to join this webinar
      </h1>
      <p className="text-body text-white/70">
        {when}. Once you&apos;re registered, this page becomes your way in — no
        meeting links to keep track of.
      </p>
      <div className="flex flex-wrap gap-3 pt-1">
        <Link href={`/events/${event.id}/register`} className={btnLight}>
          Get ticket
        </Link>
        <Link href={`/events/${event.id}`} className={btnOnDark}>
          <Icon icon={ArrowLeft} size="sm" /> Back to event
        </Link>
      </div>
    </RoomPanel>
  );
}

export function LeftScreen({
  event,
  onRejoin,
}: {
  event: Event;
  onRejoin: () => void;
}) {
  return (
    <RoomPanel>
      <p className="text-small font-bold tracking-widest text-white/60 uppercase">
        You left
      </p>
      <h1 className="text-display leading-tight font-extrabold">
        You&apos;ve left the webinar
      </h1>
      <p className="text-body text-white/70">
        It&apos;s still live — you can rejoin any time before it ends.
      </p>
      <div className="flex flex-wrap gap-3 pt-1">
        <button type="button" onClick={onRejoin} className={btnLight}>
          <Icon icon={RotateCcw} size="sm" /> Rejoin
        </button>
        <Link href={`/events/${event.id}`} className={btnOnDark}>
          <Icon icon={ArrowLeft} size="sm" /> Back to event
        </Link>
      </div>
    </RoomPanel>
  );
}

// After the end: the replay and slides. The server returns them only to ticket
// holders, and only when the organizer has published the replay; the file
// lives in our own storage, so it is a plain video, not a third-party embed.
export function EndedScreen({
  event,
  replay,
}: {
  event: Event;
  replay?: { url: string; slidesUrl?: string };
}) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 pb-10 sm:px-6">
      <div>
        <p className="text-small font-bold tracking-widest text-white/60 uppercase">
          Session ended
        </p>
        <h1 className="text-display mt-1 leading-tight font-extrabold">
          Thanks for joining
        </h1>
        <p className="text-body mt-1 text-white/70">
          Anything the organizer shares, like the replay or slides, stays here
          for everyone who registered.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {replay ? (
          <div className="aspect-video overflow-hidden rounded-md bg-black/35 ring-1 ring-white/10">
            <video
              src={replay.url}
              controls
              controlsList="nodownload"
              preload="metadata"
              className="h-full w-full"
            />
          </div>
        ) : (
          <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-md bg-black/35 text-center ring-1 ring-white/10">
            <Icon icon={PlayCircle} size="lg" className="text-white/50" />
            <p className="font-semibold">No replay available</p>
            <p className="text-small text-white/60">
              It may still be processing, or the organizer hasn&apos;t shared
              it. Check back later.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {replay?.slidesUrl && (
            <a
              href={replay.slidesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-md bg-white/10 p-4 ring-1 ring-white/10 transition-colors hover:bg-white/15"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  Slides
                </span>
                <span className="block truncate text-xs text-white/60">
                  {replay.slidesUrl.split("/").pop()}
                </span>
              </span>
              <Icon
                icon={FileText}
                size="sm"
                className="ml-auto text-white/50"
              />
            </a>
          )}
          <Link href={`/events/${event.id}`} className={btnOnDark}>
            <Icon icon={ArrowLeft} size="sm" /> Back to event
          </Link>
        </div>
      </div>
    </main>
  );
}
