"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarPlus,
  Check,
  FileText,
  Headphones,
  Lock,
  MonitorCheck,
  PlayCircle,
  Ticket,
  Video,
  X,
} from "lucide-react";
import { Icon } from "@/components/atoms";
import { googleCalendarUrl, type Event } from "@/lib/event";
import { OPENS_BEFORE_MIN } from "@/lib/webinar";
import { serverNow } from "@/lib/server-time";
import { useLiveAccess } from "@/hooks/use-live-access";

// "How to join" for online events. Three parts:
//  1. status bar — when it is, where you are in time (countdown / live / replay)
//  2. three steps — ticket → save the date → join here; the current step
//     carries the one action, finished steps tick off
//  3. what the room offers + what you need, with a one-tap browser check
// The join link is never shown or emailed — it's /events/<id>/live, which
// checks the registration. Whether you have a ticket and where the room is in
// time come from the server (live-access), not from the browser.

type State = "no-ticket" | "countdown" | "open" | "live" | "ended";

function useLeft(targetMs: number) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () =>
      setLeft(
        Math.max(0, Math.floor((targetMs - serverNow().getTime()) / 1000)),
      );
    const first = requestAnimationFrame(tick);
    const t = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(t);
    };
  }, [targetMs]);
  return left;
}

const fmt = (ms: number, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...o }).format(
    new Date(ms),
  );
const timeOf = (ms: number) => fmt(ms, { hour: "numeric", minute: "2-digit" });

function countdownLabel(left: number): string {
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

const btn =
  "bg-primary hover:bg-primary-hover text-small inline-flex min-h-9 items-center justify-center gap-2 rounded-sm px-3.5 font-semibold text-white shadow-sm transition-colors";
const ghostBtn =
  "border-border-light hover:border-border-hover text-text-primary text-small inline-flex min-h-9 items-center justify-center gap-2 rounded-sm border px-3.5 font-semibold transition-colors";

export function OnlineJoinPanel({ event }: { event: Event }) {
  const access = useLiveAccess(event.id, true);
  const start = event.startDateIso ? new Date(event.startDateIso).getTime() : 0;
  const end = event.endDateIso ? new Date(event.endDateIso).getTime() : 0;
  const opensAt = start ? start - OPENS_BEFORE_MIN.attendee * 60_000 : 0;
  const left = useLeft(opensAt);

  const state: State = !access?.registered
    ? "no-ticket"
    : access.state === "ENDED"
      ? "ended"
      : access.state === "OPEN" && access.live
        ? "live"
        : access.state === "OPEN" || access.state === "BACKSTAGE"
          ? "open"
          : "countdown";
  const replay = access?.replay;
  const door = `/events/${event.id}/live`;
  const cal = googleCalendarUrl(event);

  const when = start
    ? `${fmt(start, { weekday: "short", day: "numeric", month: "short" })} · ${timeOf(start)}${end ? ` – ${timeOf(end)}` : ""} IST`
    : "Date to be announced";

  // ------------------------------------------------------------ status bar
  const status: Record<State, { pill: string; tone: string; right: string }> = {
    "no-ticket": {
      pill: "Ticket holders only",
      tone: "bg-bg-light text-text-secondary",
      right: left ? `Doors open in ${countdownLabel(left)}` : "",
    },
    countdown: {
      pill: "Ticket confirmed",
      tone: "bg-success-light text-success",
      right: left ? `Doors open in ${countdownLabel(left)}` : "",
    },
    open: {
      pill: "Doors open",
      tone: "bg-success-light text-success",
      right: start ? `Starts at ${timeOf(start)}` : "",
    },
    live: {
      pill: "Live now",
      tone: "bg-secondary-light text-secondary",
      right: end ? `Until ${timeOf(end)}` : "",
    },
    ended: {
      pill: "Ended",
      tone: "bg-bg-light text-text-secondary",
      right: replay ? "Replay ready" : "No replay yet",
    },
  };

  // ----------------------------------------------------------------- steps
  const hasTicket = state !== "no-ticket";
  const inWindow = state === "open" || state === "live" || state === "ended";
  const steps: {
    title: string;
    body: string;
    status: "done" | "current" | "todo";
    action?: React.ReactNode;
  }[] = [
    {
      title: hasTicket ? "You have a ticket" : "Get your ticket",
      body: hasTicket
        ? "Your seat is saved to your account — no separate link to keep."
        : `${event.price === "Free" ? "It's free. " : ""}Your join access is tied to your ticket.`,
      status: hasTicket ? "done" : "current",
      action: !hasTicket && (
        <a href="#tickets" className={btn}>
          <Icon icon={Ticket} size="sm" /> Get ticket
        </a>
      ),
    },
    {
      title: "Save the date",
      body: `Add it to your calendar so you don't miss it. Doors open ${OPENS_BEFORE_MIN.attendee} minutes before it starts.`,
      status: inWindow ? "done" : hasTicket ? "current" : "todo",
      action: hasTicket && !inWindow && cal && (
        <a href={cal} target="_blank" rel="noopener noreferrer" className={btn}>
          <Icon icon={CalendarPlus} size="sm" /> Add to calendar
        </a>
      ),
    },
    state === "ended"
      ? {
          title: replay ? "Watch the replay" : "Session ended",
          body: replay
            ? "The recording and slides are one tap away for ticket holders."
            : "If the organizer shares a recording, it appears here for ticket holders.",
          status: "current",
          action: (
            <div className="flex flex-wrap gap-2">
              <Link href={door} className={btn}>
                <Icon icon={PlayCircle} size="sm" /> Watch replay
              </Link>
              {replay?.slidesUrl && (
                <a
                  href={replay.slidesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ghostBtn}
                >
                  <Icon icon={FileText} size="sm" /> Slides
                </a>
              )}
            </div>
          ),
        }
      : {
          title: "Join from this page",
          body: opensAt
            ? `Doors open at ${timeOf(opensAt)}, ${OPENS_BEFORE_MIN.attendee} minutes early. It opens in your browser — nothing to install.`
            : "It opens in your browser — nothing to install.",
          status: state === "open" || state === "live" ? "current" : "todo",
          action:
            state === "open" || state === "live" ? (
              <Link href={door} className={btn}>
                <Icon icon={Video} size="sm" /> Join now
              </Link>
            ) : hasTicket ? (
              <span className="text-small text-text-secondary inline-flex items-center gap-1.5">
                <Icon icon={Lock} size="sm" className="size-3.5" /> The Join
                button appears here at {opensAt ? timeOf(opensAt) : "doors"}
              </span>
            ) : undefined,
        },
  ];

  return (
    <div className="border-border-light bg-surface-light overflow-hidden rounded-lg border shadow-sm">
      {access?.notice && state !== "ended" && (
        <p
          role="status"
          className="border-warning text-small text-text-primary flex items-start gap-2 border-l-4 bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] px-5 py-2.5"
        >
          <span className="font-semibold">From the organizer:</span>
          {access.notice}
        </p>
      )}
      {/* 1 · status bar */}
      <div className="border-border-light flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-primary flex size-10 shrink-0 items-center justify-center rounded-md text-white">
            <Icon icon={Video} size="sm" />
          </span>
          <div className="min-w-0">
            <p className="text-text-primary font-semibold">
              Online · GCODE live room
            </p>
            <p className="text-small text-text-secondary">{when}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status[state].right && (
            <span className="text-small text-text-secondary tabular-nums">
              {status[state].right}
            </span>
          )}
          <span
            className={`text-small inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold ${status[state].tone}`}
          >
            {state === "live" && (
              <span className="bg-secondary size-2 animate-pulse rounded-full" />
            )}
            {status[state].pill}
          </span>
        </div>
      </div>

      {/* 2 · steps */}
      <ol className="px-5 py-4">
        {steps.map((step, i) => (
          <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={`absolute top-7 bottom-0 left-3 w-px ${step.status === "done" ? "bg-success" : "bg-border-light"}`}
              />
            )}
            <span
              className={`text-small relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full font-bold ${
                step.status === "done"
                  ? "bg-success text-white"
                  : step.status === "current"
                    ? "bg-primary text-white ring-4 ring-[color-mix(in_srgb,var(--color-primary)_15%,transparent)]"
                    : "bg-bg-light text-text-secondary"
              }`}
            >
              {step.status === "done" ? (
                <Icon icon={Check} size="sm" className="size-3.5" />
              ) : (
                i + 1
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={`font-semibold ${step.status === "todo" ? "text-text-secondary" : "text-text-primary"}`}
              >
                {step.title}
              </p>
              <p className="text-small text-text-secondary mt-0.5">
                {step.body}
              </p>
              {step.action && step.status === "current" && (
                <div className="mt-3">{step.action}</div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* 3 · the room + what you need */}
      <div className="bg-bg-light space-y-3 px-5 py-4">
        {state !== "ended" && <SetupCheck />}
      </div>
    </div>
  );
}

// "Will it work on my device?" — the questions people otherwise email about.
// Checks what the room actually needs: a modern browser that can play the
// stream, and a usable connection.
function SetupCheck() {
  const [result, setResult] = useState<
    { label: string; ok: boolean; note?: string }[] | null
  >(null);

  function run() {
    const nav = navigator as Navigator & {
      connection?: { downlink?: number; effectiveType?: string };
    };
    const playable =
      typeof window.MediaSource !== "undefined" ||
      document
        .createElement("video")
        .canPlayType("application/vnd.apple.mpegurl") !== "";
    const rtc = typeof window.RTCPeerConnection !== "undefined";
    const down = nav.connection?.downlink;
    setResult([
      { label: "Browser supported", ok: rtc && playable },
      {
        label: "Can play the live stream",
        ok: playable,
      },
      {
        label: "Connection",
        ok: navigator.onLine && (down === undefined || down >= 1.5),
        note:
          down !== undefined
            ? `~${down} Mbps${down < 1.5 ? " — may buffer, try Wi-Fi" : ""}`
            : navigator.onLine
              ? "Online"
              : "You're offline",
      },
    ]);
  }

  return (
    <div className="border-border-light border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small text-text-secondary inline-flex items-center gap-1.5">
          <Icon icon={Headphones} size="sm" className="size-3.5" />
          Chrome, Edge, Safari or Firefox · 2 Mbps+ · headphones help
        </p>
        <button
          type="button"
          onClick={run}
          className="text-small text-primary inline-flex items-center gap-1.5 font-semibold hover:underline"
        >
          <Icon icon={MonitorCheck} size="sm" className="size-3.5" />
          {result ? "Check again" : "Check my device"}
        </button>
      </div>
      {result && (
        <ul className="mt-2 grid gap-1 sm:grid-cols-3" role="status">
          {result.map((r) => (
            <li
              key={r.label}
              className={`text-small inline-flex items-start gap-1.5 ${r.ok ? "text-success" : "text-danger"}`}
            >
              <Icon
                icon={r.ok ? Check : X}
                size="sm"
                className="mt-0.5 size-3.5 shrink-0"
              />
              <span>
                {r.label}
                {r.note && (
                  <span className="text-text-secondary"> · {r.note}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
