"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CalendarClock,
  Check,
  Eye,
  Link2Off,
  MapPin,
  Navigation,
  Search,
  Ticket,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Badge, ButtonLink, Icon, Input, Progress } from "@/components/atoms";
import { Banner, NotFoundState, SectionHeader } from "@/components/molecules";
import { PageHeader } from "@/components/layout";
import { useEvent } from "@/hooks/use-event";
import {
  getSharedAccess,
  getSharedData,
  openShared,
  setCheckIn,
} from "@/lib/api/team";
import { ROLE_INFO, can, type SharedAccess, type SharedData } from "@/lib/team";
import { eventTypeTone } from "@/lib/event";
import { AgendaTimeline } from "../../(events)/[id]/_components/agenda-timeline";
import { groupByDay } from "../../(events)/[id]/_components/format";
import { directionsUrl } from "../../(events)/[id]/_components/venue-map";

// The dashboard a venue partner, sponsor, door volunteer or accountant gets
// from the organizer's share link — read-only, and only the parts their role
// allows (see lib/team.ts). Check-in is the one thing a partner can change.
export default function PartnerPage() {
  const { token } = useParams<{ token: string }>();
  const [access, setAccess] = useState<SharedAccess | null>();
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    getSharedAccess(token)
      .then((a) => {
        if (!live) return;
        setAccess(a);
        // Reading the link changes nothing; counting the view and activating
        // an invite is this separate POST.
        if (!a.expired) void openShared(token).catch(() => {});
      })
      .catch((e: unknown) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : "This link isn't working.");
        setAccess(null);
      });
    return () => {
      live = false;
    };
  }, [token]);

  if (access === undefined)
    return (
      <NotFoundState
        icon={Eye}
        title="Opening shared view…"
        description="Checking the link."
        actionHref="/"
        actionLabel="Browse events"
      />
    );
  if (access === null || access.expired)
    return (
      <div className="pt-10">
        <NotFoundState
          icon={Link2Off}
          title={
            access?.expired
              ? "This link has expired"
              : "This link isn't working"
          }
          description={
            access?.expired
              ? "The organizer set this link to expire. Ask them for a fresh one."
              : error ||
                "It may have been revoked. Ask the organizer for a new link."
          }
          actionHref="/"
          actionLabel="Browse events"
        />
      </div>
    );

  return <PartnerDashboard access={access} token={token} />;
}

function PartnerDashboard({
  access,
  token,
}: {
  access: SharedAccess;
  token: string;
}) {
  const { event } = useEvent(access.eventId);
  const role = access.role;
  // Everything sensitive comes from the share endpoint, which filters by role
  // on the server. This page never calls the organizer endpoints.
  const [data, setData] = useState<SharedData>();
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    void getSharedData(token)
      .then((d) => {
        if (!live) return;
        setData(d);
        setArrived(new Set(d.arrivedIds));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [token]);
  const guests = data?.guests ?? [];

  if (!event)
    return (
      <NotFoundState
        icon={Eye}
        title="Loading…"
        description="Fetching the event."
        actionHref="/"
        actionLabel="Browse events"
      />
    );

  const info = ROLE_INFO[role];
  const registered =
    event.attendeeRegistration.registeredCount +
    (event.participantRegistration.enabled
      ? event.participantRegistration.registeredCount
      : 0);
  const capacity =
    (event.attendeeRegistration.enabled
      ? (event.attendeeRegistration.capacity ?? 0)
      : 0) +
    (event.participantRegistration.enabled
      ? (event.participantRegistration.capacity ?? 0)
      : 0);
  const daysToGo = event.startDateIso
    ? Math.ceil((new Date(event.startDateIso).getTime() - now) / 86_400_000)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pt-8 pb-16">
      <Banner tone="info">
        <span className="font-semibold">View only</span> · shared by{" "}
        {event.organizer.name} · you&apos;re seeing the{" "}
        <span className="font-semibold">{info.label}</span> view
        {access.kind === "member" ? ` as ${access.viewer}` : ""}.
      </Banner>

      <PageHeader
        eyebrow={`${info.label} view`}
        title={event.title}
        meta={
          <>
            <Badge tone={eventTypeTone(event.type)} size="sm">
              {event.type}
            </Badge>
            <Badge tone="neutral" size="sm">
              {event.mode}
            </Badge>
            <Badge variant="muted" tone="neutral" size="sm">
              {event.date}
            </Badge>
          </>
        }
        subtitle={info.who}
        actions={
          role === "CO_ORGANIZER" ? (
            <ButtonLink
              href={`/my-organized-events/${event.id}`}
              variant="primary"
              size="sm"
            >
              Open full dashboard
            </ButtonLink>
          ) : (
            <ButtonLink
              href={`/${event.id}`}
              variant="secondary"
              size="sm"
            >
              Public page
            </ButtonLink>
          )
        }
      />

      {can(role, "overview") && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={Users}
            label="Registered"
            value={registered.toLocaleString("en-IN")}
            sub={capacity ? `of ${capacity} places` : "no cap"}
            progress={capacity ? registered / capacity : undefined}
          />
          <Stat
            icon={Ticket}
            label="Places left"
            value={capacity ? String(Math.max(capacity - registered, 0)) : "—"}
            sub={
              capacity
                ? `${Math.round((registered / capacity) * 100)}% full`
                : "open capacity"
            }
          />
          <Stat
            icon={CalendarClock}
            label="Days to go"
            value={
              daysToGo === null
                ? "TBA"
                : daysToGo <= 0
                  ? "Live"
                  : String(daysToGo)
            }
            sub={event.date}
          />
          <Stat
            icon={Check}
            label="Checked in"
            value={String(arrived.size)}
            sub={registered ? `of ${registered} registered` : "doors not open"}
          />
        </section>
      )}

      {can(role, "venue") && event.mode !== "Online" && (
        <VenueSection event={event} registered={registered} />
      )}
      {can(role, "schedule") && event.timeline.length > 0 && (
        <ScheduleSection timeline={event.timeline} />
      )}
      {can(role, "money") && <MoneySection money={data?.money} />}
      {can(role, "attendees") && (
        <GuestList
          eventId={event.id}
          token={token}
          guests={guests}
          arrived={arrived}
          setArrived={setArrived}
          canCheckIn={can(role, "checkIn")}
        />
      )}

      <p className="text-small text-text-secondary border-border-light border-t pt-6 text-center">
        This page is view-only
        {can(role, "checkIn") ? " (apart from check-in)" : ""}. Need something
        changed? Contact {event.organizer.name}.
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  progress,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  progress?: number;
}) {
  return (
    <div className="border-border-light bg-surface-light rounded-lg border p-4 shadow-sm">
      <div className="text-text-secondary flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
        <Icon icon={icon} size="sm" className="size-4" /> {label}
      </div>
      <p className="text-heading text-text-primary mt-2 leading-none font-extrabold tabular-nums">
        {value}
      </p>
      <p className="text-small text-text-secondary mt-1">{sub}</p>
      {progress !== undefined && (
        <Progress
          value={progress * 100}
          tone="success"
          className="mt-3 h-1.5"
          label={label}
        />
      )}
    </div>
  );
}

function VenueSection({
  event,
  registered,
}: {
  event: NonNullable<ReturnType<typeof useEvent>["event"]>;
  registered: number;
}) {
  // In-person days: from the hybrid stages when set, else the agenda's days.
  const days = event.stages.length
    ? event.stages
        .filter((s) => s.mode !== "Online")
        .map((s) => ({
          label: s.label,
          date: s.date,
          endDate: s.endDate,
          time: s.time,
          venue: s.venue || event.location,
        }))
    : groupByDay(event.timeline)
        .filter((g) => g.day)
        .map((g) => ({
          label: g.title || "Event day",
          date: g.day,
          endDate: undefined as string | undefined,
          time: g.items[0]?.time ?? "",
          venue: event.location,
        }));
  const fmt = (d: string) =>
    d
      ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        })
      : "Date TBA";

  return (
    <section className="space-y-3">
      <SectionHeader
        title="At the venue"
        description="Who to expect on each in-person day — plan staff, seating and food from this."
        actions={
          <ButtonLink
            href={directionsUrl(event.location)}
            variant="secondary"
            size="sm"
          >
            <Icon icon={Navigation} size="sm" /> Directions
          </ButtonLink>
        }
      />
      <div className="border-border-light bg-surface-light overflow-hidden rounded-lg border shadow-sm">
        <div className="border-border-light flex items-start gap-3 border-b p-4">
          <span className="bg-secondary-light text-secondary grid size-9 shrink-0 place-items-center rounded-md">
            <Icon icon={MapPin} size="sm" className="size-4" />
          </span>
          <p className="text-small text-text-primary pt-2 font-medium">
            {event.location}
          </p>
        </div>
        {days.length === 0 ? (
          <p className="text-small text-text-secondary p-4">
            No in-person days set yet.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-border-light border-b">
                {["Day", "Date", "Starts", "Expected"].map((h) => (
                  <th
                    key={h}
                    className="text-text-secondary p-3 text-xs font-semibold tracking-wide uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => (
                <tr
                  key={i}
                  className="border-border-light border-b last:border-b-0"
                >
                  <td className="text-small text-text-primary p-3 font-semibold">
                    {d.label}
                  </td>
                  <td className="text-small text-text-secondary p-3">
                    {fmt(d.date)}
                    {d.endDate && ` – ${fmt(d.endDate)}`}
                  </td>
                  <td className="text-small text-text-secondary p-3">
                    {d.time || "TBA"}
                  </td>
                  <td className="text-small text-text-primary p-3 font-semibold tabular-nums">
                    {/* later rounds only bring the shortlisted acts plus the audience */}
                    {registered.toLocaleString("en-IN")}
                    <span className="text-text-secondary font-normal">
                      {" "}
                      registered
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function ScheduleSection({
  timeline,
}: {
  timeline: Parameters<typeof groupByDay>[0];
}) {
  const days = groupByDay(timeline);
  return (
    <section className="space-y-3">
      <SectionHeader
        title="Run of show"
        description="The agenda, day by day."
      />
      <div className="space-y-3">
        {days.map((g) => (
          <div
            key={g.day || "tba"}
            className="border-border-light bg-surface-light rounded-lg border p-5 shadow-sm"
          >
            <p className="text-text-primary mb-4 font-semibold">
              {g.label || g.title || (g.day ? g.day : "Date to be announced")}
            </p>
            <AgendaTimeline items={g.items} />
          </div>
        ))}
      </div>
    </section>
  );
}

function MoneySection({ money }: { money?: SharedData["money"] }) {
  return (
    <section className="space-y-3">
      <SectionHeader
        title="Money"
        description="Read-only. Payments are confirmed by the organizer."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          icon={Wallet}
          label="UPI claims waiting"
          value={money ? String(money.pendingClaims) : "…"}
          sub={
            money
              ? `₹${money.pendingAmount.toLocaleString("en-IN")} to verify`
              : ""
          }
        />
        <Stat
          icon={Ticket}
          label="Live coupons"
          value={money ? String(money.activeCoupons) : "…"}
          sub="discount codes active"
        />
      </div>
    </section>
  );
}

function GuestList({
  eventId,
  token,
  guests,
  arrived,
  setArrived,
  canCheckIn,
}: {
  eventId: string;
  token: string;
  guests: SharedData["guests"];
  arrived: Set<string>;
  setArrived: (s: Set<string>) => void;
  canCheckIn: boolean;
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () =>
      [...guests]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((a) =>
          a.name.toLowerCase().includes(query.trim().toLowerCase()),
        ),
    [guests, query],
  );

  async function toggle(id: string) {
    const next = new Set(arrived);
    const on = !next.has(id);
    if (on) next.add(id);
    else next.delete(id);
    setArrived(next);
    try {
      await setCheckIn(eventId, id, on, token);
    } catch {
      // Put it back: the server refused (link expired or revoked).
      const back = new Set(next);
      if (on) back.delete(id);
      else back.add(id);
      setArrived(back);
    }
  }

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Guest list"
        description={`${arrived.size} of ${guests.length} checked in. Contact details are never shown on a shared view.`}
      />
      <div className="border-border-light bg-surface-light overflow-hidden rounded-lg border shadow-sm">
        <div className="border-border-light border-b p-3">
          <Input
            icon={Search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a name"
            aria-label="Find a name"
          />
        </div>
        <ul className="max-h-[32rem] overflow-y-auto">
          {rows.map((a) => {
            const on = arrived.has(a.id);
            return (
              <li
                key={a.id}
                className="border-border-light flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
              >
                <span className="bg-primary-light text-primary grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold">
                  {a.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-text-primary block truncate text-sm font-semibold">
                    {a.name}
                  </span>
                  <span className="text-text-secondary block truncate text-xs">
                    {a.category === "Participant" ? "Performer" : "Attendee"}
                  </span>
                </span>
                {canCheckIn ? (
                  <button
                    type="button"
                    onClick={() => void toggle(a.id)}
                    aria-pressed={on}
                    className={`text-small inline-flex min-h-9 items-center gap-1.5 rounded-sm px-3 font-semibold transition-colors ${
                      on
                        ? "bg-success text-white"
                        : "border-border-light text-text-primary hover:bg-bg-light border"
                    }`}
                  >
                    {on && <Icon icon={Check} size="sm" className="size-4" />}
                    {on ? "Arrived" : "Check in"}
                  </button>
                ) : (
                  on && (
                    <Badge tone="success" size="sm">
                      Arrived
                    </Badge>
                  )
                )}
              </li>
            );
          })}
          {rows.length === 0 && (
            <li className="text-small text-text-secondary p-4 text-center">
              No one matches.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
