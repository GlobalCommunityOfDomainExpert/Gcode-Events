"use client";

// Building blocks of the public event page, shared with the organizer's
// edit page so its preview renders exactly what attendees see — one
// section at a time.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Calendar,
  Check,
  ChevronDown,
  Globe,
  Clock,
  Lock,
  MapPin,
  Navigation,
  ScrollText,
  Ticket,
} from "lucide-react";
import { Badge, Button, ButtonLink, Icon } from "@/components/atoms";
import { getEventColor } from "@/lib/event-color";
import {
  Event,
  EventTimelineItem,
  formatTimeRange,
  formatWeekday,
  hasEventEnded,
} from "@/lib/event";
import { groupByDay, resolveDisplayTime, to12Hour, daysUntil } from "./format";

export { MediaSection } from "./event-media";

// ------------------------------------------------------------- passes state

type WindowStatus =
  | { state: "not-open-yet"; days: number }
  | { state: "closed" }
  | { state: "closing-soon"; days: number }
  | { state: "open" };

// "enabled" (organizer offers this pass at all) is separate from "open right
// now" (within its own registration window) — an enabled-but-not-yet-open or
// enabled-but-closed pass still shows up, just greyed out.
function windowStatus(data: Event["attendeeRegistration"]): WindowStatus {
  const opensDays = daysUntil(data.registrationOpensIso);
  if (opensDays !== null && opensDays > 0) {
    return { state: "not-open-yet", days: opensDays };
  }
  const closesDays = daysUntil(data.registrationDeadlineIso);
  if (closesDays !== null) {
    return closesDays <= 0
      ? { state: "closed" }
      : { state: "closing-soon", days: closesDays };
  }
  return { state: "open" };
}

function windowStatusMeta(status: WindowStatus): string | undefined {
  if (status.state === "not-open-yet") return `Opens in ${status.days}d`;
  if (status.state === "closed") return "Closed";
  if (status.state === "closing-soon") return `Closes in ${status.days}d`;
  return undefined;
}

const isBookable = (st: WindowStatus) =>
  st.state === "open" || st.state === "closing-soon";

// Everything the page derives from the event + clock: live/past state, which
// passes show (bookable first), and why booking is blocked, if it is.
export function getEventState(event: Event, now: Date) {
  const isPast = hasEventEnded(event, now);
  const isCancelled = event.status === "CANCELLED";
  const isLive = !isCancelled && !isPast;

  const enabledPasses = [
    { category: "ATTENDEE" as const, data: event.attendeeRegistration },
    { category: "PARTICIPANT" as const, data: event.participantRegistration },
  ]
    .filter((p) => p.data.enabled)
    .map((p) => ({ ...p, status: windowStatus(p.data) }))
    .sort(
      (a, b) => Number(isBookable(b.status)) - Number(isBookable(a.status)),
    );
  const selectedPass = enabledPasses.find((p) => isBookable(p.status));
  // What the price/seat summary describes: the chosen pass, else the first.
  const shownPass = selectedPass ?? enabledPasses[0];
  const registerHref = selectedPass
    ? `/events/${event.id}/register?category=${selectedPass.category}`
    : undefined;

  const priceLabel = shownPass ? shownPass.data.priceLabel : event.price;
  const capacity = shownPass?.data.capacity;
  const registered = shownPass?.data.registeredCount ?? event.registeredCount;
  const spotsLeft =
    capacity !== undefined ? Math.max(capacity - registered, 0) : undefined;

  const ctaDisabledLabel = isCancelled
    ? "Event Cancelled"
    : isPast
      ? "Event Ended"
      : enabledPasses.length === 0
        ? "Registration Closed"
        : !selectedPass
          ? (windowStatusMeta(enabledPasses[0].status) ?? "Registration Closed")
          : spotsLeft === 0
            ? "Sold Out"
            : undefined;

  const timeRange = formatTimeRange(event.startDateIso, event.endDateIso);
  const weekday = formatWeekday(event.startDateIso);
  // "Sunday, 15 Nov 2026" or, for multi-day events, "Sun 15 – Mon 16 Nov 2026".
  const dateLabel =
    formatDateRange(event.startDateIso, event.endDateIso) ??
    (weekday ? `${weekday}, ${event.date}` : event.date);
  // "Pinnacle School…, 36/3 & 36/6, …, Bengaluru" → bold name + lighter rest.
  const [venueName, ...venueRest] = event.location
    .split(",")
    .map((x) => x.trim());

  return {
    isPast,
    isCancelled,
    isLive,
    enabledPasses,
    selectedPass,
    registerHref,
    priceLabel,
    ctaDisabledLabel,
    timeRange,
    weekday,
    dateLabel,
    venueName,
    venueAddress: venueRest.join(", "),
  };
}

export type EventState = ReturnType<typeof getEventState>;

export function PrimaryCta({ state }: { state: EventState }) {
  return state.ctaDisabledLabel ? (
    <Button variant="secondary" className="w-full" disabled>
      {state.ctaDisabledLabel}
    </Button>
  ) : (
    <ButtonLink href={state.registerHref!} variant="accent" className="w-full">
      Reserve Seat <Icon icon={ArrowRight} size="sm" />
    </ButtonLink>
  );
}

// ---------------------------------------------------------------- sections

// Banner at 3:1 (wizard asks for 1800×600). Older 8:3 uploads (1600×600) fit
// with ~5.5% trimmed top and bottom, so their text and logos survive.
// Nothing is drawn over the artwork.
export function EventCover({
  event,
  state,
}: {
  event: Event;
  state: EventState;
}) {
  return (
    <div
      className={`border-border-light relative aspect-[3/1] w-full overflow-hidden rounded-sm border shadow-sm ${state.isPast ? "grayscale" : ""}`}
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
          alt={event.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}

export function EventPills({
  event,
  state,
}: {
  event: Event;
  state: EventState;
}) {
  return (
    <>
      {state.isCancelled && (
        <Badge variant="solid" tone="danger" size="sm">
          Cancelled
        </Badge>
      )}
      {state.isPast && !state.isCancelled && (
        <Badge variant="solid" tone="neutral" size="sm">
          Event ended
        </Badge>
      )}
      <Badge variant="solid" tone="primary" size="sm">
        {event.type}
      </Badge>
      <span className="border-border-hover text-text-primary text-small inline-flex h-5 items-center rounded-full border px-2 leading-none font-semibold">
        {event.mode}
      </span>
    </>
  );
}

// Date + time line under the title.
export function EventMeta({
  event,
  state,
  className = "",
}: {
  event: Event;
  state: EventState;
  className?: string;
}) {
  const time = state.timeRange
    ? `${state.timeRange} IST`
    : resolveDisplayTime(event);
  return (
    <ul
      className={`text-small text-text-secondary flex flex-wrap gap-x-5 gap-y-2 ${className}`}
    >
      <li className="flex items-center gap-2">
        <Icon icon={Calendar} size="sm" className="opacity-70" />
        {state.dateLabel}
      </li>
      {time && (
        <li className="flex items-center gap-2">
          <Icon icon={Clock} size="sm" className="opacity-70" />
          {time}
        </li>
      )}
    </ul>
  );
}

// Title, one-line summary, date + time.
export function EventHeading({
  event,
  state,
  showMeta = true,
  className = "",
}: {
  event: Event;
  state: EventState;
  showMeta?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <h1 className="text-text-primary text-3xl leading-tight font-extrabold">
        {event.title}
      </h1>
      {event.summary && (
        <p className="text-text-secondary mt-3 leading-relaxed">
          {event.summary}
        </p>
      )}
      {showMeta && <EventMeta event={event} state={state} className="mt-5" />}
    </div>
  );
}

// Long write-ups start collapsed to a few lines with a fade and a small
// "Read more"; short ones show in full (the toggle only appears when the
// text actually overflows).
export function AboutSection({ event }: { event: Event }) {
  const paragraphs =
    event.description.length > 0
      ? event.description
      : event.summary
        ? [event.summary]
        : [];
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 4);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [paragraphs.length]);

  if (paragraphs.length === 0) return null;
  const collapsed = !expanded;

  return (
    <Section title="About this event">
      <div className="relative">
        <div
          ref={bodyRef}
          className={`text-body text-text-secondary space-y-4 leading-relaxed ${collapsed ? "max-h-44 overflow-hidden" : ""}`}
        >
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        {collapsed && overflows && (
          <div
            aria-hidden
            className="from-background pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t to-transparent"
          />
        )}
      </div>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="text-small text-primary -mt-1 inline-flex items-center gap-1 font-semibold hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
          <Icon
            icon={ChevronDown}
            size="sm"
            className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </Section>
  );
}

// Multi-day agendas are a list of collapsed day rows (date, hours, session
// count, a one-line preview); open a day to see its full timeline.
// Single-day agendas show the timeline.
export function ScheduleSection({ event }: { event: Event }) {
  const days = groupByDay(event.timeline);
  return (
    <Section title="Schedule">
      {event.timeline.length === 0 ? (
        <p className="text-small text-text-secondary">
          The detailed agenda will be shared closer to the date.
        </p>
      ) : days.length === 1 ? (
        <AgendaTimeline items={days[0].items} />
      ) : (
        <div className="border-border-light border-t">
          {days.map((group) => (
            <AgendaDay
              key={group.day || "tba"}
              dayNumber={
                group.day
                  ? days.filter((d) => d.day && d.day <= group.day).length
                  : undefined
              }
              day={group.day}
              items={group.items}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

export function LocationSection({
  event,
  state,
}: {
  event: Event;
  state: EventState;
}) {
  return (
    <Section title={event.mode === "Online" ? "How to join" : "Location"}>
      {event.mode === "Hybrid" && <OnlineInfoCard />}
      {event.mode === "Online" ? (
        <OnlineInfoCard />
      ) : (
        <div className="border-border-light bg-surface-light @container overflow-hidden rounded-lg border shadow-sm">
          <div className="bg-bg-light relative aspect-[16/7] w-full">
            <iframe
              title={`Map showing ${state.venueName}`}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(event.location)}&z=15&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
          <div className="flex flex-col gap-4 p-5 @sm:flex-row @sm:items-center @sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="bg-secondary-light text-secondary flex size-10 shrink-0 items-center justify-center rounded-md">
                <Icon icon={MapPin} size="sm" />
              </span>
              <div className="min-w-0">
                <p className="text-text-primary font-semibold">
                  {state.venueName || "Venue to be announced"}
                </p>
                {state.venueAddress && (
                  <p className="text-small text-text-secondary mt-0.5">
                    {state.venueAddress}
                  </p>
                )}
              </div>
            </div>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-primary hover:bg-primary-hover text-small inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-sm px-4 font-semibold text-white shadow-sm transition-colors"
            >
              <Icon icon={Navigation} size="sm" />
              Get directions
            </a>
          </div>
        </div>
      )}
    </Section>
  );
}

export function WhoSection({ event }: { event: Event }) {
  if (event.eligibility.length === 0) return null;
  return (
    <Section title="Who it's for">
      <div className="flex flex-wrap gap-2">
        {[event.type, event.mode, event.teamSize].filter(Boolean).map((tag) => (
          <span
            key={tag}
            className="bg-bg-light text-text-primary text-small rounded-full px-3 py-1 font-medium"
          >
            {tag}
          </span>
        ))}
      </div>
      <ul className="space-y-3">
        {event.eligibility.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <span className="bg-success-light text-success mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
              <Icon icon={Check} size="sm" className="size-3.5" />
            </span>
            <span className="text-body text-text-secondary">{item}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// Fine print — rarely read, so collapsed by default.
export function TermsSection({
  event,
  defaultOpen = false,
}: {
  event: Event;
  defaultOpen?: boolean;
}) {
  if (event.terms.length === 0) return null;
  return (
    <details
      open={defaultOpen}
      className="group border-border-light bg-surface-light rounded-lg border shadow-sm [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="text-text-primary flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold">
        <span className="flex items-center gap-3">
          <Icon icon={ScrollText} size="sm" className="text-text-secondary" />
          Terms &amp; conditions
        </span>
        <Icon
          icon={ChevronDown}
          size="sm"
          className="text-text-secondary transition-transform group-open:rotate-180"
        />
      </summary>
      <ol className="text-small text-text-secondary border-border-light list-decimal space-y-2 border-t px-5 py-4 pl-10">
        {event.terms.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </details>
  );
}

// "Get tickets" card: every enabled pass as a ticket, bookable ones first.
export function TicketsCard({
  event,
  state,
}: {
  event: Event;
  state: EventState;
}) {
  const { isLive, enabledPasses, selectedPass, ctaDisabledLabel } = state;
  return (
    <div id="tickets" className="border-border-light bg-surface-light scroll-mt-24 rounded-lg border p-6 shadow-md">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-text-primary flex items-center gap-2 text-lg font-bold">
          <Icon icon={Ticket} size="sm" className="text-secondary" />
          Get tickets
        </h2>
        {isLive && selectedPass?.status.state === "closing-soon" && (
          <span className="text-small text-text-secondary flex items-center gap-1.5">
            <Icon icon={Clock} size="sm" className="opacity-70" />
            {windowStatusMeta(selectedPass.status)}
          </span>
        )}
      </div>

      {isLive && enabledPasses.length > 0 && (
        <div className="mt-4 space-y-3">
          {enabledPasses.map(({ category, data, status: st }) => {
            const locked = !isBookable(st);
            const left =
              data.capacity !== undefined
                ? Math.max(data.capacity - data.registeredCount, 0)
                : undefined;
            return (
              <TicketOption
                key={category}
                label={data.label}
                description={data.description}
                price={data.priceLabel}
                seatsLeft={locked ? undefined : left}
                locked={locked}
                lockLabel={windowStatusMeta(st)}
                lockTitle={
                  st.state === "not-open-yet"
                    ? `${data.label} registration unlocks in ${st.days} day${st.days === 1 ? "" : "s"}`
                    : st.state === "closed"
                      ? `${data.label} registration is closed`
                      : undefined
                }
                href={`/events/${event.id}/register?category=${category}`}
              />
            );
          })}
        </div>
      )}

      {ctaDisabledLabel && !(isLive && enabledPasses.length > 0) && (
        <div className="mt-5">
          <PrimaryCta state={state} />
        </div>
      )}
    </div>
  );
}

export function HostCard({ event }: { event: Event }) {
  return (
    <div className="border-border-light bg-surface-light flex items-center gap-3 rounded-lg border p-4 shadow-sm">
      <span className="bg-primary-light text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold">
        {event.organizer.name.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0">
        <p className="text-small text-text-secondary">Hosted by</p>
        <p className="text-body text-text-primary truncate font-semibold">
          {event.organizer.name}
        </p>
      </div>
    </div>
  );
}

// A pass rendered as a ticket: details on the left, a perforated divider
// with half-circle notches, and the price "stub" on the right. An open
// ticket IS the action — it links straight to registration for that pass.
function TicketOption({
  label,
  description,
  price,
  seatsLeft,
  locked,
  lockLabel,
  lockTitle,
  href,
}: {
  label: string;
  description?: string;
  price: string;
  seatsLeft?: number;
  locked: boolean;
  lockLabel?: string;
  lockTitle?: string;
  href: string;
}) {
  // Not bookable: either outside its window (locked) or out of seats.
  const soldOut = !locked && seatsLeft === 0;
  const dim = locked || soldOut;
  const edge = dim ? "border-border-light" : "border-secondary/40";
  const shell = `group relative flex w-full items-stretch rounded-sm border text-left transition-all ${edge} ${
    dim
      ? "bg-bg-subtle cursor-not-allowed"
      : "bg-secondary-light hover:border-secondary hover:shadow-md focus-visible:ring-secondary/25 focus-visible:ring-4 focus-visible:outline-none"
  }`;
  const tag = locked ? lockLabel : soldOut ? "Sold out" : undefined;

  const body = (
    <>
      {/* details */}
      <span className="flex min-w-0 flex-1 items-start gap-3 p-3.5">
        <span
          aria-hidden
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md ${
            dim
              ? "bg-bg-light text-text-secondary"
              : "bg-secondary text-white shadow-sm"
          } transition-colors`}
        >
          <Icon icon={locked ? Lock : Ticket} size="sm" />
        </span>
        <span className="min-w-0">
          <span
            className={`text-body block font-semibold ${dim ? "text-text-secondary" : "text-text-primary"}`}
          >
            {label}
          </span>
          {description && (
            <span className="text-small text-text-secondary line-clamp-2 block">
              {description}
            </span>
          )}
          {tag && (
            <span className="bg-bg-light text-text-secondary mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
              {tag}
            </span>
          )}
        </span>
      </span>

      {/* perforation + notches */}
      <span
        aria-hidden
        className={`relative w-0 border-l-2 border-dashed transition-colors ${edge} ${dim ? "" : "group-hover:border-secondary"}`}
      >
        <span
          className={`bg-surface-light absolute -top-px left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-colors ${edge} ${dim ? "" : "group-hover:border-secondary"} [clip-path:inset(50%_0_0_0)]`}
        />
        <span
          className={`bg-surface-light absolute -bottom-px left-1/2 size-5 -translate-x-1/2 translate-y-1/2 rounded-full border transition-colors ${edge} ${dim ? "" : "group-hover:border-secondary"} [clip-path:inset(0_0_50%_0)]`}
        />
      </span>

      {/* price stub */}
      <span className="flex w-24 shrink-0 flex-col items-center justify-center px-2 py-3 text-center">
        <span
          className={`text-lg leading-tight font-extrabold ${dim ? "text-text-secondary" : "text-text-primary"} ${soldOut ? "line-through decoration-2" : ""}`}
        >
          {price}
        </span>
        <span className="text-text-secondary mt-0.5 text-xs">
          {locked
            ? "Locked"
            : soldOut
              ? "No seats left"
              : seatsLeft !== undefined
                ? `${seatsLeft} left`
                : "per seat"}
        </span>
        {!dim && (
          <span className="text-secondary mt-1.5 inline-flex items-center gap-1 text-xs font-bold">
            Get
            <Icon
              icon={ArrowRight}
              size="sm"
              className="size-3 transition-transform group-hover:translate-x-0.5"
            />
          </span>
        )}
      </span>
    </>
  );

  if (dim) {
    return (
      <div
        aria-disabled
        title={soldOut ? `${label} is sold out` : lockTitle}
        className={shell}
      >
        {body}
      </div>
    );
  }
  return (
    <Link
      href={href}
      aria-label={`Get ${label} ticket, ${price}`}
      className={shell}
    >
      {body}
    </Link>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-text-primary text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

const IST_TZ = "Asia/Kolkata";

// Multi-day range in IST ("Sun 15 – Mon 16 Nov 2026"); null for single-day.
function formatDateRange(
  startIso?: string | null,
  endIso?: string | null,
): string | null {
  if (!startIso || !endIso) return null;
  const part = (iso: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-IN", { ...o, timeZone: IST_TZ }).format(
      new Date(iso),
    );
  const ymd = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: IST_TZ }).format(
      new Date(iso),
    );
  if (ymd(startIso) === ymd(endIso)) return null;
  const wd = (iso: string) => part(iso, { weekday: "short" });
  const d = (iso: string) => part(iso, { day: "numeric" });
  const m = (iso: string) => part(iso, { month: "short" });
  const y = (iso: string) => part(iso, { year: "numeric" });
  const sameMonth = m(startIso) === m(endIso) && y(startIso) === y(endIso);
  const start = `${wd(startIso)} ${d(startIso)}${sameMonth ? "" : ` ${m(startIso)}`}`;
  return `${start} – ${wd(endIso)} ${d(endIso)} ${m(endIso)} ${y(endIso)}`;
}

// One collapsible day: summary row (date, hours, count, preview) → timeline.
function AgendaDay({
  dayNumber,
  day,
  items,
}: {
  /** Undefined for the "date to be announced" group. */
  dayNumber?: number;
  day: string;
  items: EventTimelineItem[];
}) {
  // `day` is the IST calendar date "YYYY-MM-DD"; format it as a plain date.
  const date = day ? new Date(`${day}T00:00:00Z`) : null;
  const f = (o: Intl.DateTimeFormatOptions) =>
    date
      ? new Intl.DateTimeFormat("en-IN", { ...o, timeZone: "UTC" }).format(date)
      : "";
  const first = items[0];
  const last = items[items.length - 1];
  // A one-off milestone (e.g. "Registrations close") shows one time, not
  // a "11:59 PM – 11:59 PM" range.
  const endTime = last?.endTime || last?.time;
  const hours = !first?.time
    ? ""
    : !endTime || endTime === first.time
      ? to12Hour(first.time)
      : `${to12Hour(first.time)} – ${to12Hour(endTime)}`;
  const preview = items
    .slice(0, 2)
    .map((item) => item.title)
    .join(" · ");
  const more = items.length - 2;

  return (
    <details className="group border-border-light border-b [&_summary::-webkit-details-marker]:hidden">
      <summary className="hover:bg-bg-subtle -mx-3 flex cursor-pointer list-none items-center gap-4 rounded-sm px-3 py-4 transition-colors">
        <span
          aria-hidden
          className="border-border-light bg-surface-light flex w-11 shrink-0 flex-col overflow-hidden rounded-md border text-center"
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
            {date ? (
              <>
                Day {dayNumber}
                <span className="text-text-secondary font-normal">
                  {" "}
                  · {f({ weekday: "long", day: "numeric", month: "short" })}
                </span>
              </>
            ) : (
              "Date to be announced"
            )}
          </span>
          <span className="text-small text-text-secondary block">
            {[hours, `${items.length} session${items.length === 1 ? "" : "s"}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="text-small text-text-secondary/80 mt-0.5 line-clamp-1 block group-open:hidden">
            {preview}
            {more > 0 && (
              <span className="text-text-secondary font-medium">
                {" "}
                +{more} more
              </span>
            )}
          </span>
        </span>

        <span className="text-primary text-small flex shrink-0 items-center gap-1 font-semibold">
          <span className="group-open:hidden">View agenda</span>
          <span className="hidden group-open:inline">Hide</span>
          <Icon
            icon={ChevronDown}
            size="sm"
            className="transition-transform group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="pt-1 pb-6">
        <AgendaTimeline items={items} />
      </div>
    </details>
  );
}

// Times on the left, a connecting rail, sessions on the right.
function AgendaTimeline({ items }: { items: EventTimelineItem[] }) {
  return (
    <ol>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <li
            key={`${item.title}-${index}`}
            className="grid grid-cols-[4.75rem_1.25rem_minmax(0,1fr)] gap-x-3"
          >
            <div className="pt-0.5 text-right">
              <p className="text-small text-text-primary font-semibold tabular-nums">
                {to12Hour(item.time)}
              </p>
              {item.endTime && (
                <p className="text-text-secondary text-xs tabular-nums">
                  {to12Hour(item.endTime)}
                </p>
              )}
            </div>
            <div className="flex flex-col items-center">
              <span
                className={`mt-1.5 size-2.5 shrink-0 rounded-full ${index === 0 ? "bg-secondary ring-secondary-light ring-4" : "bg-border-hover"}`}
              />
              {!last && <span className="bg-border-light mt-1 w-px flex-1" />}
            </div>
            <div className={last ? "" : "pb-6"}>
              <p className="text-body text-text-primary font-semibold">
                {item.title}
              </p>
              {item.description && (
                <p className="text-small text-text-secondary mt-0.5">
                  {item.description}
                </p>
              )}
              {item.location && (
                <p className="text-text-secondary mt-1.5 inline-flex items-center gap-1 text-xs font-medium">
                  <Icon icon={MapPin} size="sm" className="size-3.5" />
                  {item.location}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Port stand-in for the wireframe's OnlineJoinPanel (webinar flow is out of
// scope): a static card; joining details come with registration.
function OnlineInfoCard() {
  return (
    <div className="border-border-light bg-surface-light flex items-start gap-3 rounded-lg border p-5 shadow-sm">
      <span className="bg-secondary-light text-secondary flex size-10 shrink-0 items-center justify-center rounded-md">
        <Icon icon={Globe} size="sm" />
      </span>
      <div className="min-w-0">
        <p className="text-text-primary font-semibold">Online event</p>
        <p className="text-small text-text-secondary mt-0.5">
          Joining details are shared with registered attendees.
        </p>
      </div>
    </div>
  );
}
