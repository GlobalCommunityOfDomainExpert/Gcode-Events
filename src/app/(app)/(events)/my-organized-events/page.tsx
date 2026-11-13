"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarPlus,
  Copy,
  Ellipsis,
  ExternalLink,
  PencilLine,
  SearchX,
  Trophy,
  Users,
} from "lucide-react";
import { Button, ButtonLink, Icon, Select } from "@/components/atoms";
import {
  EmptyState,
  MyOrganizedEventsSkeleton,
  SearchBar,
  Tabs,
} from "@/components/molecules";
import { PageHeader } from "@/components/layout";
import { Event, eventTypeTone } from "@/lib/event";
import { getEventColor } from "@/lib/event-color";
import { useEvents } from "@/hooks/use-events";
import { useServerNow } from "@/hooks/use-server-now";
import {
  attentionFor,
  bucketOf,
  eventTools,
  inr,
  relativeWhen,
  revenueOf,
  startMs,
  totalCapacity,
  totalRegistered,
  type Bucket,
} from "@/lib/organizer";

type Filter = Bucket | "all";
type Sort = "date" | "registrations" | "revenue";

const TABS: { value: Filter; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "draft", label: "Drafts" },
  { value: "past", label: "Past" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

const EMPTY: Record<Filter, string> = {
  upcoming: "Nothing coming up.",
  draft: "No drafts — nice and tidy.",
  past: "No past events yet.",
  cancelled: "No cancelled events.",
  all: "No events match.",
};

const TONE_DOT: Record<string, string> = {
  warning: "bg-warning",
  danger: "bg-secondary",
  info: "bg-primary",
};

// useSearchParams needs a Suspense boundary under Next 16; the fallback is the
// same skeleton as loading.tsx.
export default function MyOrganizedEventsPage() {
  return (
    <Suspense fallback={<MyOrganizedEventsSkeleton />}>
      <OrganizedEventsList />
    </Suspense>
  );
}

function OrganizedEventsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { events, status } = useEvents();
  const now = useServerNow();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("date");

  const raw = searchParams.get("status");
  const filter: Filter = TABS.some((t) => t.value === raw)
    ? (raw as Filter)
    : "upcoming";

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      upcoming: 0,
      draft: 0,
      past: 0,
      cancelled: 0,
      all: events.length,
    };
    for (const e of events) c[bucketOf(e, now)] += 1;
    return c;
  }, [events, now]);

  const types = useMemo(
    () => [...new Set(events.map((e) => e.type))].sort(),
    [events],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = events.filter((e) => {
      if (filter !== "all" && bucketOf(e, now) !== filter) return false;
      if (type !== "all" && e.type !== type) return false;
      if (!q) return true;
      // Real list rows can have a blank location or an unresolved type.
      return [e.title, e.location, e.type].some((s) =>
        (s ?? "").toLowerCase().includes(q),
      );
    });
    // Upcoming/drafts: soonest first. Past/cancelled/all: most recent first.
    const asc = filter === "upcoming" || filter === "draft";
    return [...list].sort((a, b) =>
      sort === "registrations"
        ? totalRegistered(b) - totalRegistered(a)
        : sort === "revenue"
          ? revenueOf(b) - revenueOf(a)
          : asc
            ? startMs(a) - startMs(b)
            : startMs(b) - startMs(a),
    );
  }, [events, filter, type, query, sort, now]);

  const nextUp = useMemo(
    () =>
      events
        .filter((e) => bucketOf(e, now) === "upcoming")
        .sort((a, b) => startMs(a) - startMs(b))[0],
    [events, now],
  );
  const attentionCount = events.reduce(
    (n, e) => n + (attentionFor(e, now, { roundsKnown: false }).length ? 1 : 0),
    0,
  );
  const upcomingRegs = events
    .filter((e) => bucketOf(e, now) === "upcoming")
    .reduce((n, e) => n + totalRegistered(e), 0);
  const totalRevenue = events
    .filter((e) => e.status !== "CANCELLED")
    .reduce((n, e) => n + revenueOf(e), 0);

  const go = (f: Filter) =>
    router.push(
      f === "upcoming"
        ? "/my-organized-events"
        : `/my-organized-events?status=${f}`,
    );

  if (status === "loading") return <MyOrganizedEventsSkeleton />;

  return (
    <div className="pt-8">
      <PageHeader
        eyebrow="Organizing"
        title="Your events"
        subtitle="Everything you're hosting — what's next, what needs you, and how each event is doing."
        actions={
          <ButtonLink href="/my-organized-events/new" variant="accent">
            + Host Event
          </ButtonLink>
        }
      />

      {status === "error" ? (
        <EmptyState
          icon={SearchX}
          title="Couldn't load your events"
          description="Something went wrong fetching your events."
          action={
            <Button
              variant="secondary"
              onClick={() => window.location.reload()}
            >
              Try again
            </Button>
          }
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="You haven't hosted an event yet"
          description="Set up your first event — save it as a draft from any step and come back later."
          action={
            <ButtonLink href="/my-organized-events/new" variant="primary">
              + Host Event
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* ---------------------------------------------- next up + stats */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {nextUp ? <NextUp event={nextUp} now={now} /> : <div />}
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Upcoming"
                value={String(counts.upcoming)}
                sub={`${counts.draft} draft${counts.draft === 1 ? "" : "s"}`}
              />
              <Stat
                label="Registrations"
                value={upcomingRegs.toLocaleString("en-IN")}
                sub="across upcoming"
              />
              <Stat
                label="Est. revenue"
                value={inr(totalRevenue)}
                sub="all events"
              />
              <Stat
                label="Needs attention"
                value={String(attentionCount)}
                sub={attentionCount ? "see flags below" : "all good"}
                accent={attentionCount > 0}
              />
            </div>
          </div>

          {/* ------------------------------------------------------ filters */}
          <Tabs
            items={TABS.map((t) => ({
              value: t.value,
              label: `${t.label} (${counts[t.value]})`,
            }))}
            value={filter}
            onChange={(v) => go(v as Filter)}
          />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search events by title, type or city"
              className="flex-1"
            />
            <div className="flex flex-wrap gap-1.5">
              {["all", ...types].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`text-small rounded-full border px-3 py-1.5 font-medium transition-colors ${
                    type === t
                      ? "border-primary bg-primary text-white"
                      : "border-border-light bg-surface-light text-text-secondary hover:border-border-hover hover:text-text-primary"
                  }`}
                >
                  {t === "all" ? "All types" : t}
                </button>
              ))}
            </div>
            <Select
              aria-label="Sort events"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="lg:w-48"
            >
              <option value="date">
                {filter === "upcoming" || filter === "draft"
                  ? "Soonest first"
                  : "Most recent first"}
              </option>
              <option value="registrations">Most registrations</option>
              <option value="revenue">Most revenue</option>
            </Select>
          </div>

          {/* -------------------------------------------------------- table */}
          {visible.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={EMPTY[filter]}
              description={
                query || type !== "all"
                  ? "Try a different search or type."
                  : undefined
              }
              action={
                query || type !== "all" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setType("all");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="border-border-light bg-surface-light overflow-visible rounded-lg border shadow-sm">
              <div className="text-text-secondary border-border-light hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_auto] gap-4 border-b px-4 py-2.5 text-xs font-semibold lg:grid">
                <span>Event</span>
                <span>When</span>
                <span>Registrations</span>
                <span>Est. revenue</span>
                <span>Status</span>
                <span className="w-[8.5rem]" />
              </div>
              <ul className="divide-border-light divide-y">
                {visible.map((e) => (
                  <EventRow key={e.id} event={e} now={now} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="border-border-light bg-surface-light rounded-lg border p-4 shadow-sm">
      <p className="text-text-secondary text-xs font-semibold">{label}</p>
      <p
        className={`mt-1 text-2xl font-extrabold ${accent ? "text-secondary" : "text-text-primary"}`}
      >
        {value}
      </p>
      <p className="text-text-secondary text-xs">{sub}</p>
    </div>
  );
}

// The soonest upcoming event, with the actions you'd reach for first.
function NextUp({ event, now }: { event: Event; now: Date }) {
  const tools = eventTools(event);
  const base = `/my-organized-events/${event.id}`;
  const cap = totalCapacity(event);
  const pct = cap
    ? Math.min(100, Math.round((totalRegistered(event) / cap) * 100))
    : null;
  const special = tools.judging
    ? { href: `${base}/rounds`, label: "Judging", icon: Trophy }
    : { href: `${base}/attendees`, label: "Attendees", icon: Users };
  return (
    <div className="border-border-light bg-surface-light flex overflow-hidden rounded-lg border shadow-sm">
      <div
        className="relative hidden w-56 shrink-0 sm:block"
        style={
          event.coverImageUrl
            ? undefined
            : { backgroundColor: getEventColor(event.id) }
        }
      >
        {event.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.coverImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1 p-5">
        <p className="text-secondary text-xs font-bold tracking-widest uppercase">
          Next up · {relativeWhen(event, now)}
        </p>
        <Link
          href={base}
          className="text-text-primary hover:text-primary mt-1 line-clamp-1 text-lg font-bold"
        >
          {event.title}
        </Link>
        <p className="text-small text-text-secondary">
          {event.date} · {event.type} · {event.mode}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="bg-bg-light h-1.5 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
          <span className="text-small text-text-primary shrink-0 font-semibold tabular-nums">
            {totalRegistered(event)}
            {cap ? ` / ${cap}` : ""} registered
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href={base} variant="primary" size="sm">
            Manage <Icon icon={ArrowRight} size="sm" className="size-4" />
          </ButtonLink>
          <ButtonLink href={special.href} variant="secondary" size="sm">
            <Icon icon={special.icon} size="sm" className="size-4" />{" "}
            {special.label}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

function EventRow({ event, now }: { event: Event; now: Date }) {
  const bucket = bucketOf(event, now);
  const base = `/my-organized-events/${event.id}`;
  const flags = attentionFor(event, now, { roundsKnown: false });
  const cap = totalCapacity(event);
  const pct = cap
    ? Math.min(100, Math.round((totalRegistered(event) / cap) * 100))
    : null;
  const revenue = revenueOf(event);
  const statusPill =
    bucket === "draft"
      ? { label: "Draft", cls: "bg-bg-light text-text-secondary" }
      : bucket === "cancelled"
        ? { label: "Cancelled", cls: "bg-danger-light text-danger" }
        : bucket === "past"
          ? { label: "Ended", cls: "bg-bg-light text-text-secondary" }
          : { label: "Open", cls: "bg-success-light text-success" };

  return (
    <li className="hover:bg-bg-subtle relative grid gap-3 px-4 py-3.5 transition-colors lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_auto] lg:items-center lg:gap-4">
      {/* event */}
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`relative block aspect-[3/1] w-24 shrink-0 overflow-hidden rounded-sm ${bucket === "past" ? "grayscale" : ""}`}
          style={
            event.coverImageUrl
              ? undefined
              : { backgroundColor: getEventColor(event.id) }
          }
        >
          {event.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.coverImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </span>
        <div className="min-w-0">
          <Link
            href={base}
            className="text-text-primary hover:text-primary line-clamp-1 font-semibold after:absolute after:inset-0 lg:after:content-none"
          >
            {event.title}
          </Link>
          <p className="text-text-secondary mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span
              className={`inline-flex rounded-full px-1.5 py-px font-semibold ${TONE_CHIP[eventTypeTone(event.type)] ?? "bg-bg-light"}`}
            >
              {event.type}
            </span>
            <span>{event.mode}</span>
          </p>
        </div>
      </div>

      {/* when */}
      <div className="text-small">
        <p className="text-text-primary">{event.date}</p>
        <p className="text-text-secondary text-xs">
          {relativeWhen(event, now)}
        </p>
      </div>

      {/* registrations */}
      <div>
        {bucket === "draft" ? (
          <span className="text-text-secondary text-small">—</span>
        ) : (
          <>
            <p className="text-small text-text-primary font-semibold tabular-nums">
              {totalRegistered(event)}
              {cap ? (
                <span className="text-text-secondary font-normal">
                  {" "}
                  / {cap}
                </span>
              ) : null}
            </p>
            {pct !== null && (
              <div className="bg-bg-light mt-1 h-1 w-28 overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full ${pct >= 90 ? "bg-secondary" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* revenue */}
      <p className="text-small text-text-primary tabular-nums">
        {inr(revenue)}
      </p>

      {/* status + attention */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusPill.cls}`}
        >
          {statusPill.label}
        </span>
        {flags.map((f) => (
          <Link
            key={f.label}
            href={`${base}${f.path}`}
            className="border-border-light text-text-primary hover:border-border-hover relative z-10 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
          >
            <span className={`size-1.5 rounded-full ${TONE_DOT[f.tone]}`} />
            {f.label}
          </Link>
        ))}
      </div>

      {/* actions */}
      <div className="relative z-10 flex items-center justify-end gap-1">
        <ButtonLink
          href={bucket === "draft" ? `${base}/edit` : base}
          variant="secondary"
          size="sm"
        >
          {bucket === "draft" ? "Continue" : "Manage"}
        </ButtonLink>
        <RowMenu event={event} />
      </div>
    </li>
  );
}

const TONE_CHIP: Record<string, string> = {
  primary: "bg-primary-light text-primary",
  success: "bg-success-light text-success",
  warning: "bg-warning-light text-text-primary",
  danger: "bg-danger-light text-danger",
  neutral: "bg-bg-light text-text-secondary",
};

function RowMenu({ event }: { event: Event }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const base = `/my-organized-events/${event.id}`;
  const item =
    "text-small text-text-primary hover:bg-bg-light flex w-full items-center gap-2.5 px-3 py-2 text-left";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-text-secondary hover:bg-bg-light hover:text-text-primary flex size-9 items-center justify-center rounded-sm"
      >
        <Icon icon={Ellipsis} size="sm" />
      </button>
      {open && (
        <div className="border-border-light bg-surface-light absolute top-10 right-0 z-30 w-52 overflow-hidden rounded-md border py-1 shadow-lg">
          <Link href={`/events/${event.id}`} target="_blank" className={item}>
            <Icon icon={ExternalLink} size="sm" className="size-4" /> View
            public page
          </Link>
          <Link href={`${base}/edit`} className={item}>
            <Icon icon={PencilLine} size="sm" className="size-4" /> Edit details
          </Link>
          <Link href={`${base}/attendees`} className={item}>
            <Icon icon={Users} size="sm" className="size-4" /> Attendees
          </Link>
          <button
            type="button"
            className={item}
            onClick={() => {
              void navigator.clipboard?.writeText(
                `${window.location.origin}/events/${event.id}`,
              );
              setCopied(true);
              setTimeout(() => {
                setCopied(false);
                setOpen(false);
              }, 900);
            }}
          >
            <Icon icon={Copy} size="sm" className="size-4" />{" "}
            {copied ? "Link copied" : "Copy event link"}
          </button>
        </div>
      )}
    </div>
  );
}
