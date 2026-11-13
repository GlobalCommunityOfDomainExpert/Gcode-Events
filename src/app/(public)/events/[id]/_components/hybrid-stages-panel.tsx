"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Layers,
  ListOrdered,
  Lock,
  Map as MapIcon,
  MapPin,
  Navigation,
  Upload,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/atoms";
import type { Event, EventStage, EventTimelineItem } from "@/lib/event";
import {
  STAGE_MODE_LABEL,
  stageCountdown,
  stageStatus,
  type StageStatus,
} from "@/lib/event-stages";
import { hasLiveRoom } from "@/lib/live-room";
import { useMyTickets } from "@/hooks/use-my-tickets";
import { AgendaTimeline } from "./agenda-timeline";
import { OnlineInfoCard } from "./online-info-card";
import { groupByDay, to12Hour } from "./format";
import { MapEmbed, directionsUrl } from "./venue-map";

type Mode = EventStage["mode"];

const MODE_ICON: Record<Mode, LucideIcon> = {
  Online: Video,
  "In-Person": MapPin,
  Both: Layers,
};

const STATUS_TONE: Record<StageStatus, string> = {
  done: "bg-bg-light text-text-secondary",
  today: "bg-success-light text-success",
  upcoming: "bg-primary-light text-primary",
  tba: "bg-warning-light text-warning",
};

type Action = {
  label: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
};

/**
 * One day on the merged schedule: an organizer stage (Round 1, Semi Final…)
 * with that date's agenda sessions folded in, or an agenda-only day
 * (Registrations close, Results) that has no stage of its own.
 */
type DayRow = {
  key: string;
  label: string;
  date: string;
  mode: Mode;
  stage?: EventStage;
  sessions: EventTimelineItem[];
};

// A session is online when its location says so; anything else is a venue.
const sessionOnline = (s: EventTimelineItem) =>
  /^online\b/i.test(s.location?.trim() ?? "");

function mixMode(base: Mode | undefined, sessions: EventTimelineItem[]): Mode {
  const on = sessions.some(sessionOnline) || base === "Online";
  const off =
    sessions.some((s) => s.location?.trim() && !sessionOnline(s)) ||
    base === "In-Person";
  if (base === "Both" || (on && off)) return "Both";
  return off ? "In-Person" : (base ?? "Online");
}

// Stages + agenda → one dated run. Stage rows own the agenda sessions on
// their date; leftover agenda days become rows of their own.
function buildRows(stages: EventStage[], timeline: EventTimelineItem[]) {
  const groups = groupByDay(timeline);
  const used = new Set<string>();
  const rows: DayRow[] = stages.map((stage, i) => {
    const sessions =
      (stage.date && groups.find((g) => g.day === stage.date)?.items) || [];
    if (stage.date) used.add(stage.date);
    return {
      key: `stage-${i}`,
      label: stage.label,
      date: stage.date,
      mode: mixMode(stage.mode, sessions),
      stage,
      sessions,
    };
  });
  for (const g of groups) {
    if (!g.day || used.has(g.day)) continue;
    rows.push({
      key: `day-${g.day}`,
      label: g.title || g.items[0].title,
      date: g.day,
      mode: mixMode(undefined, g.items),
      sessions: g.items,
    });
  }
  // dated rows by date, date-TBA ones after in the organizer's order
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) =>
      a.r.date && b.r.date
        ? a.r.date.localeCompare(b.r.date) || a.i - b.i
        : a.r.date
          ? -1
          : b.r.date
            ? 1
            : a.i - b.i,
    )
    .map(({ r }) => r);
}

// "7:00 PM – 11:00 PM" across the day's sessions, else the stage's time.
function hoursOf(row: DayRow): string {
  const first = row.sessions[0];
  if (!first?.time) return row.stage?.time ? to12Hour(row.stage.time) : "";
  const last = row.sessions[row.sessions.length - 1];
  const end = last.endTime || last.time;
  return !end || end === first.time
    ? to12Hour(first.time)
    : `${to12Hour(first.time)} – ${to12Hour(end)}`;
}

/**
 * Hybrid events split into stages: the schedule and the where/how in one
 * list, styled like the plain Schedule. A row per day; only the day that
 * matters now (today's, else the next one) is open, showing where it is
 * and its buttons. The agenda and the map stay folded until asked for.
 */
export function HybridStagesPanel({
  event,
  registerHref,
}: {
  event: Event;
  registerHref?: string;
}) {
  const rows = buildRows(event.stages, event.timeline);
  const [now] = useState(() => new Date());
  const current = Math.max(
    rows.findIndex((r) => stageStatus(r, now) !== "done"),
    0,
  );
  const [open, setOpen] = useState<number | null>(current);
  const { tickets } = useMyTickets();
  const participantId = tickets.find(
    (t) => t.eventId === event.id,
  )?.participantId;

  return (
    <ol aria-label="Schedule" className="border-border-light border-t">
      {rows.map((row, i) => (
        <DayRowItem
          key={row.key}
          event={event}
          row={row}
          current={i === current}
          open={open === i}
          onToggle={() => setOpen(open === i ? null : i)}
          now={now}
          participantId={participantId}
          registerHref={registerHref}
        />
      ))}
    </ol>
  );
}

function DayRowItem({
  event,
  row,
  current,
  open,
  onToggle,
  now,
  participantId,
  registerHref,
}: {
  event: Event;
  row: DayRow;
  current: boolean;
  open: boolean;
  onToggle: () => void;
  now: Date;
  participantId?: string;
  registerHref?: string;
}) {
  const status = stageStatus(row, now);
  const done = status === "done";
  const inPerson = row.mode !== "Online";
  const venue = row.stage?.venue || event.location;
  const venueName = venue.split(",")[0].trim();
  const date = row.date ? new Date(`${row.date}T00:00:00Z`) : null;
  const f = (o: Intl.DateTimeFormatOptions) =>
    date
      ? new Intl.DateTimeFormat("en-IN", { ...o, timeZone: "UTC" }).format(date)
      : "";
  const pill = stageCountdown(row, now) ?? "Completed";
  const bodyId = `${row.key}-body`;
  const meta = [
    STAGE_MODE_LABEL[row.mode],
    hoursOf(row),
    inPerson ? venueName : "",
  ].filter(Boolean);

  return (
    <li
      className={`border-border-light border-b ${done && !open ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="hover:bg-bg-subtle -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-4 rounded-sm px-3 py-4 text-left transition-colors"
      >
        {/* same date tile as the plain Schedule */}
        <span
          aria-hidden
          className={`bg-surface-light flex w-11 shrink-0 flex-col overflow-hidden rounded-md border text-center ${
            current
              ? "border-primary ring-primary/15 ring-4"
              : "border-border-light"
          }`}
        >
          <span className="bg-primary py-px text-[9px] font-bold tracking-widest text-white">
            {date ? f({ month: "short" }).toUpperCase() : "DATE"}
          </span>
          <span
            className={`text-text-primary py-0.5 leading-tight font-extrabold ${date ? "text-lg" : "text-[11px] leading-[1.6rem]"}`}
          >
            {date ? f({ day: "numeric" }) : "TBA"}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="text-text-primary block font-semibold">
            {row.label}
            {date && (
              <span className="text-text-secondary font-normal">
                {" "}
                · {f({ weekday: "long", day: "numeric", month: "short" })}
              </span>
            )}
          </span>
          <span className="text-small text-text-secondary flex items-center gap-1.5">
            <Icon
              icon={MODE_ICON[row.mode]}
              size="sm"
              className="size-3.5 shrink-0"
            />
            <span className="truncate">{meta.join(" · ")}</span>
          </span>
        </span>

        <span
          className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold sm:inline ${STATUS_TONE[status]}`}
        >
          {pill}
        </span>
        <Icon
          icon={ChevronDown}
          size="sm"
          className={`text-primary shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div id={bodyId} className="space-y-4 pb-5 sm:pl-[3.75rem]">
          <DayBody
            event={event}
            row={row}
            venue={venue}
            participantId={participantId}
            registerHref={registerHref}
          />
        </div>
      )}
    </li>
  );
}

function DayBody({
  event,
  row,
  venue,
  participantId,
  registerHref,
}: {
  event: Event;
  row: DayRow;
  venue: string;
  participantId?: string;
  registerHref?: string;
}) {
  const [showAgenda, setShowAgenda] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const stage = row.stage;
  const online = row.mode !== "In-Person";
  const inPerson = row.mode !== "Online";
  const [venueName, ...venueRest] = venue.split(",").map((x) => x.trim());
  const { actions, note } = stage
    ? stageActions(
        event,
        { ...stage, mode: row.mode },
        participantId,
        registerHref,
      )
    : { actions: [], note: undefined };
  const liveRoom = !!stage && online && !stage.link && hasLiveRoom(event);
  const onlineText = stage?.link
    ? participantId
      ? "Join link below — please don't share it."
      : "Join link unlocks once you're registered."
    : liveRoom
      ? "Live room on this page."
      : stage?.cta === "submit"
        ? "Send your entry from anywhere."
        : row.sessions.some(sessionOnline) && inPerson
          ? "Some sessions are online — see the agenda."
          : /shortlist|result|announc|winner/i.test(row.label)
            ? "Results go out by email and on your ticket page."
            : "Nothing to join live.";

  return (
    <>
      {/* where — one line per place */}
      <ul className="grid gap-3 sm:grid-cols-2">
        {inPerson && (
          <WhereLine
            icon={MapPin}
            title={venueName || "Venue to be announced"}
            text={venueRest.join(", ")}
          />
        )}
        {online && <WhereLine icon={Video} title="Online" text={onlineText} />}
      </ul>

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((a, i) => (
            <ActionLink key={a.label + i} action={a} primary={i === 0} />
          ))}
        </div>
      )}
      {note && (
        <p className="text-small text-text-secondary flex items-start gap-1.5">
          <Icon
            icon={note.icon}
            size="sm"
            className="mt-0.5 size-3.5 shrink-0"
          />
          {note.text}
        </p>
      )}
      {liveRoom && <OnlineInfoCard />}

      {/* the detail, only on request */}
      {(row.sessions.length > 0 || inPerson) && (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {row.sessions.length > 0 && (
            <Toggle
              icon={ListOrdered}
              on={showAgenda}
              onClick={() => setShowAgenda((v) => !v)}
              label={`${showAgenda ? "Hide" : "View"} agenda · ${row.sessions.length} session${row.sessions.length === 1 ? "" : "s"}`}
            />
          )}
          {inPerson && (
            <Toggle
              icon={MapIcon}
              on={showMap}
              onClick={() => setShowMap((v) => !v)}
              label={showMap ? "Hide map" : "Show map"}
            />
          )}
        </div>
      )}
      {showAgenda && (
        <div className="pt-1">
          <AgendaTimeline items={row.sessions} />
        </div>
      )}
      {showMap && (
        <MapEmbed
          location={venue}
          className="border-border-light overflow-hidden rounded-md border"
        />
      )}
    </>
  );
}

function Toggle({
  icon,
  label,
  on,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={on}
      className="text-primary text-small inline-flex items-center gap-1.5 font-semibold hover:underline"
    >
      <Icon icon={icon} size="sm" className="size-4" />
      {label}
      <Icon
        icon={ChevronDown}
        size="sm"
        className={`size-4 transition-transform ${on ? "rotate-180" : ""}`}
      />
    </button>
  );
}

function WhereLine({
  icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
}) {
  return (
    <li className="flex min-w-0 items-start gap-2.5">
      <span className="bg-primary-light text-primary grid size-8 shrink-0 place-items-center rounded-md">
        <Icon icon={icon} size="sm" className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="text-text-primary block text-sm font-semibold">
          {title}
        </span>
        {text && (
          <span className="text-small text-text-secondary block">{text}</span>
        )}
      </span>
    </li>
  );
}

// The stage's buttons, most important first (the first one is filled):
//   organizer's button (submit / custom link) → join → directions.
// The organizer's text replaces the stage's main button label, whichever
// that is. Anything that can't be a button becomes a one-line note.
function stageActions(
  event: Event,
  stage: EventStage,
  participantId: string | undefined,
  registerHref: string | undefined,
): { actions: Action[]; note?: { icon: LucideIcon; text: string } } {
  const actions: Action[] = [];
  let note: { icon: LucideIcon; text: string } | undefined;
  const custom = stage.ctaLabel?.trim();
  const online = stage.mode !== "In-Person";
  const inPerson = stage.mode !== "Online";
  const hasTicket = !!participantId;
  let labelled = false;
  const label = (fallback: string) => {
    if (labelled || !custom) return fallback;
    labelled = true;
    return custom;
  };

  if (stage.cta === "submit") {
    if (hasTicket) {
      actions.push({
        label: label("Submit entry"),
        href: `/events/${event.id}/additional-info?pid=${participantId}`,
        icon: Upload,
      });
    } else {
      labelled = true; // the custom text is for ticket holders
      if (registerHref)
        actions.push({
          label: "Register to submit",
          href: registerHref,
          icon: ArrowRight,
        });
      note = {
        icon: Lock,
        text: "Your entry form opens right after you register.",
      };
    }
  } else if (stage.cta === "link" && stage.ctaUrl) {
    actions.push({
      label: label("Open link"),
      href: stage.ctaUrl,
      icon: ExternalLink,
      external: true,
    });
  }

  if (online && stage.link) {
    if (hasTicket) {
      actions.push({
        label: label("Join meeting"),
        href: stage.link,
        icon: Video,
        external: true,
      });
    } else {
      if (registerHref && actions.length === 0)
        actions.push({
          label: "Get ticket to join",
          href: registerHref,
          icon: ArrowRight,
        });
      note ??= {
        icon: Lock,
        text: "The meeting link unlocks here once you're registered.",
      };
    }
  }

  if (inPerson) {
    actions.push({
      label: label("Get directions"),
      href: directionsUrl(stage.venue || event.location),
      icon: Navigation,
      external: true,
    });
  }

  return { actions, note };
}

function ActionLink({ action, primary }: { action: Action; primary: boolean }) {
  const cls = `text-small inline-flex min-h-10 items-center gap-2 rounded-sm px-4 font-semibold transition-colors ${
    primary
      ? "bg-primary hover:bg-primary-hover text-white shadow-sm"
      : "border-border-light bg-surface-light text-text-primary hover:bg-bg-light border"
  }`;
  const inner = (
    <>
      <Icon icon={action.icon} size="sm" className="size-4" />
      {action.label}
    </>
  );
  return action.external ? (
    <a
      href={action.href}
      target="_blank"
      rel="noopener noreferrer"
      className={cls}
    >
      {inner}
    </a>
  ) : (
    <Link href={action.href} className={cls}>
      {inner}
    </Link>
  );
}
