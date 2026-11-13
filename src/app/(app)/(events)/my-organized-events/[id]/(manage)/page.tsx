"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, ButtonLink, Switch } from "@/components/atoms";
import {
  AreaChart,
  BarList,
  ChartCard,
  ChecklistItem,
  DonutChart,
  FocusTile,
  ProgressRing,
  StatStrip,
  ToggleGroup,
} from "@/components/molecules";
import { hasEventEnded } from "@/lib/event";
import { updateEvent } from "@/lib/api/events";
import { useServerNow } from "@/hooks/use-server-now";
import { useOrganizedEvent } from "../_components/event-context";

const DAY_MS = 86_400_000;

function daysUntil(
  iso: string | null | undefined,
  fallback: string,
  now: Date,
) {
  const target = new Date(iso || fallback);
  if (Number.isNaN(target.getTime())) return null;
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((target.getTime() - a.getTime()) / DAY_MS));
}

export default function OverviewPage() {
  const { event, attendees, refreshEvent, notify, isCancelled } =
    useOrganizedEvent();
  const now = useServerNow();
  const [range, setRange] = useState("14");
  const [toggling, setToggling] = useState<"ATTENDEE" | "PARTICIPANT" | null>(
    null,
  );

  const base = `/my-organized-events/${event.id}`;
  const isDraft = event.status === "DRAFT";
  const ended = hasEventEnded(event, now);

  const active = attendees.filter((a) => a.status !== "cancelled");
  // One number everywhere: both passes, against both capacities.
  const pass2 = event.participantRegistration;
  const totalRegistered =
    event.registeredCount + (pass2.enabled ? pass2.registeredCount : 0);
  const totalCapacity =
    event.capacity && (!pass2.enabled || pass2.capacity)
      ? event.capacity + (pass2.enabled ? (pass2.capacity ?? 0) : 0)
      : undefined;
  const passBreakdown = pass2.enabled
    ? `${event.registeredCount} ${event.attendeeRegistration.label} · ${pass2.registeredCount} ${pass2.label}`
    : undefined;
  const attended = attendees.filter((a) => a.status === "attended").length;
  const attendeePasses = attendees.filter((a) => a.category === "Attendee");
  const participants = attendees.filter((a) => a.category === "Participant");
  const paidAttendees = attendeePasses.filter(
    (a) => a.ticketType === "Paid" && a.status !== "cancelled",
  ).length;
  const paidParticipants = participants.filter(
    (a) => a.ticketType === "Paid" && a.status !== "cancelled",
  ).length;
  const revenue =
    (event.priceAmount ?? 0) * paidAttendees +
    (event.participantRegistration.price || 0) * paidParticipants;

  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const thisWeek = active.filter(
    (a) => new Date(a.registeredAt) >= weekAgo,
  ).length;

  const daysLeft = daysUntil(
    event.attendeeRegistration.registrationDeadlineIso,
    event.date,
    now,
  );

  const trend = useMemo(() => {
    const n = Number(range);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: n }, (_, i) => {
      const day = new Date(today.getTime() - (n - 1 - i) * DAY_MS);
      const next = new Date(day.getTime() + DAY_MS);
      return {
        label: day.toLocaleDateString("en-IN", {
          month: "short",
          day: "numeric",
        }),
        value: attendees.filter((a) => {
          const at = new Date(a.registeredAt);
          return at >= day && at < next;
        }).length,
      };
    });
  }, [attendees, range, now]);
  const trendTotal = trend.reduce((s, p) => s + p.value, 0);

  const checklist = [
    {
      label: "Cover image",
      subtext: "Events with a cover get more clicks",
      done: !!event.coverImageUrl,
    },
    {
      label: "Description",
      done: event.description.some((p) => p.trim().length > 0),
    },
    { label: "Agenda / timeline", done: event.timeline.length > 0 },
    {
      label: "Registration open",
      done: event.attendeeRegistration.enabled,
    },
    ...(event.participantRegistration.enabled
      ? [{ label: "Rounds defined", done: event.rounds.length > 0 }]
      : []),
  ];
  const setupDone = checklist.filter((c) => c.done).length;
  const setupPct = Math.round((setupDone / checklist.length) * 100);

  async function toggleRegistration(
    category: "ATTENDEE" | "PARTICIPANT",
    nextEnabled: boolean,
  ) {
    setToggling(category);
    try {
      await updateEvent(
        event.id,
        category === "ATTENDEE"
          ? { attendee_registration_enabled: nextEnabled ? 1 : 0 }
          : { participant_registration_enabled: nextEnabled ? 1 : 0 },
      );
      await refreshEvent();
      notify(
        `${category === "ATTENDEE" ? event.attendeeRegistration.label : event.participantRegistration.label} pass ${nextEnabled ? "opened" : "closed"}`,
      );
    } catch {
      notify("Couldn't update registration. Try again.", "error");
    } finally {
      setToggling(null);
    }
  }

  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/events/${event.id}`,
      );
      notify("Public event link copied");
    } catch {
      notify("Couldn't copy the link — copy it from Settings", "error");
    }
  }

  // ---- Hero: the one thing that matters right now ----
  const hero = (() => {
    if (isCancelled) {
      return {
        urgent: true,
        eyebrow: "Cancelled",
        value: String(totalRegistered),
        label: "had registered",
        text: "This event was cancelled. Registrations are closed and the public page says so.",
        actions: undefined,
      };
    }
    if (isDraft) {
      return {
        urgent: false,
        eyebrow: "Draft",
        value: `${setupDone}/${checklist.length}`,
        label: "setup steps done",
        text: "This event isn't visible to anyone yet. Finish the remaining steps and publish when ready.",
        actions: (
          <ButtonLink href={`${base}/edit`} variant="primary">
            Continue editing
          </ButtonLink>
        ),
      };
    }
    if (ended) {
      return {
        urgent: false,
        eyebrow: "Event ended",
        value: String(attended),
        label: `of ${active.length} attended`,
        text: "Mark who showed up, then export the attendee list for your records.",
        actions: (
          <>
            <ButtonLink href={`${base}/attendees`} variant="primary">
              Review attendance
            </ButtonLink>
            <ButtonLink href={`${base}/attendees`} variant="secondary">
              Export attendees
            </ButtonLink>
          </>
        ),
      };
    }
    if (totalRegistered === 0) {
      return {
        urgent: false,
        eyebrow: "Registration open",
        value: "0",
        label: "registrations yet",
        text: "Share the public link with your audience to get the first sign-ups.",
        actions: (
          <Button variant="primary" onClick={copyPublicLink}>
            Copy public link
          </Button>
        ),
      };
    }
    if (daysLeft !== null && daysLeft <= 3) {
      return {
        urgent: true,
        eyebrow: "Closing soon",
        value: `${daysLeft}d`,
        label: "left to register",
        text: `${totalRegistered} registered so far. Share the link once more before registration closes.`,
        actions: (
          <Button variant="accent" onClick={copyPublicLink}>
            Copy link
          </Button>
        ),
      };
    }
    return {
      urgent: false,
      eyebrow: `Registration open${daysLeft !== null ? ` · ${daysLeft} days left` : ""}`,
      value: totalRegistered.toLocaleString(),
      label: totalCapacity ? `of ${totalCapacity} registered` : "registered",
      text:
        thisWeek > 0
          ? `+${thisWeek} in the last 7 days. Keep the momentum going.`
          : "No new registrations this week — sharing the link again can help.",
      actions: (
        <>
          <ButtonLink href={`${base}/attendees`} variant="primary">
            View attendees
          </ButtonLink>
          <Button variant="secondary" onClick={copyPublicLink}>
            Copy link
          </Button>
        </>
      ),
    };
  })();

  const capacityPct = event.capacity
    ? Math.min(100, Math.round((event.registeredCount / event.capacity) * 100))
    : null;
  const pCap = event.participantRegistration.capacity;
  const participantPct = pCap
    ? Math.min(
        100,
        Math.round(
          (event.participantRegistration.registeredCount / pCap) * 100,
        ),
      )
    : null;
  const showParticipant =
    event.participantRegistration.enabled ||
    event.participantRegistration.registeredCount > 0;

  const roleCounts = Object.entries(
    active.reduce<Record<string, number>>((acc, a) => {
      acc[a.role] = (acc[a.role] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const ageRows = [
    ["Below 18", "YOUNGSTER"],
    ["18–60", "ADULT"],
    ["60 and above", "SENIOR"],
  ].map(([label, key]) => ({
    label,
    value: participants.filter((p) => p.ageCategory === key).length,
  }));

  const interested = event.interestedCount ?? 0;
  // "I'm interested" isn't a step everyone passes through on the way to
  // registering, so only show a conversion when it can actually be one.
  const pct = (n: number, d: number) =>
    d > 0 && n <= d
      ? `${Math.round((n / d) * 100)}% of previous step`
      : undefined;

  return (
    <div className="space-y-6">
      <FocusTile {...hero} />

      <StatStrip
        stats={[
          {
            label: "Registered",
            value: totalRegistered.toLocaleString(),
            trend: thisWeek > 0 ? `+${thisWeek} this week` : undefined,
            sub:
              passBreakdown ??
              (totalCapacity ? `${totalCapacity} capacity` : "No cap"),
          },
          {
            label: "Est. revenue",
            value: `₹${revenue.toLocaleString()}`,
            sub:
              paidAttendees + paidParticipants > 0
                ? `${paidAttendees + paidParticipants} paid tickets`
                : "Free event",
          },
          {
            label: "Interested",
            value: interested.toLocaleString(),
            sub: "clicked I'm Interested",
          },
          {
            label: "Registration closes",
            value: daysLeft !== null ? `${daysLeft}d` : "—",
            sub: event.attendeeRegistration.registrationCloses,
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Registrations"
          description={`${trendTotal} in the last ${range} days`}
          action={
            <ToggleGroup
              options={[
                { value: "7", label: "7d" },
                { value: "14", label: "14d" },
                { value: "30", label: "30d" },
              ]}
              value={range}
              onChange={setRange}
            />
          }
        >
          <AreaChart points={trend} unit="registration" />
        </ChartCard>

        <ChartCard
          title="Capacity & passes"
          description="Open or close a pass at any time"
        >
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <ProgressRing
                value={capacityPct ?? 0}
                tone="secondary"
                label="Capacity filled"
              >
                {capacityPct !== null ? undefined : "∞"}
              </ProgressRing>
              <div className="min-w-0 flex-1">
                <p className="text-small text-text-primary font-semibold">
                  {event.attendeeRegistration.label}
                </p>
                <p className="text-small text-text-secondary mb-2">
                  {event.registeredCount}
                  {event.capacity ? ` / ${event.capacity}` : ""} registered
                </p>
                <Switch
                  label={event.attendeeRegistration.enabled ? "Open" : "Closed"}
                  checked={event.attendeeRegistration.enabled}
                  disabled={toggling !== null}
                  onChange={(e) =>
                    toggleRegistration("ATTENDEE", e.target.checked)
                  }
                />
              </div>
            </div>
            {showParticipant && (
              <div className="border-border-light flex items-center gap-4 border-t pt-5">
                <ProgressRing
                  value={participantPct ?? 0}
                  tone="primary"
                  label="Participant capacity filled"
                >
                  {participantPct !== null ? undefined : "∞"}
                </ProgressRing>
                <div className="min-w-0 flex-1">
                  <p className="text-small text-text-primary font-semibold">
                    {event.participantRegistration.label}
                  </p>
                  <p className="text-small text-text-secondary mb-2">
                    {event.participantRegistration.registeredCount}
                    {pCap ? ` / ${pCap}` : ""} registered
                  </p>
                  <Switch
                    label={
                      event.participantRegistration.enabled ? "Open" : "Closed"
                    }
                    checked={event.participantRegistration.enabled}
                    disabled={toggling !== null}
                    onChange={(e) =>
                      toggleRegistration("PARTICIPANT", e.target.checked)
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Audience funnel"
          description="From interest to showing up"
        >
          <BarList
            rows={[
              { label: "Interested", value: interested, tone: "muted" },
              {
                label: "Registered",
                value: active.length,
                tone: "primary",
                sub: pct(active.length, interested),
              },
              {
                label: "Attended",
                value: attended,
                tone: "success",
                sub: pct(attended, active.length),
              },
            ]}
            max={Math.max(interested, active.length, attended)}
          />
        </ChartCard>

        <ChartCard title="Ticket mix" description="Paid vs free vs cancelled">
          <DonutChart
            centerValue={attendees.length}
            centerLabel="registrations"
            segments={[
              {
                label: "Paid",
                tone: "primary",
                value: active.filter((a) => a.ticketType === "Paid").length,
              },
              {
                label: "Free",
                tone: "success",
                value: active.filter((a) => a.ticketType === "Free").length,
              },
              {
                label: "Cancelled",
                tone: "muted",
                value: attendees.length - active.length,
              },
            ]}
          />
        </ChartCard>

        {roleCounts.length > 0 && (
          <ChartCard title="Who's coming" description="Registrations by role">
            <BarList
              rows={roleCounts.map(([label, value]) => ({
                label,
                value,
                tone: "secondary" as const,
              }))}
            />
          </ChartCard>
        )}

        {showParticipant && participants.length > 0 && (
          <ChartCard
            title="Participant ages"
            description="From the additional-info step"
          >
            <BarList rows={ageRows} />
          </ChartCard>
        )}

        {setupDone < checklist.length && !isCancelled && (
          <ChartCard
            title="Event setup"
            description={`${setupDone} of ${checklist.length} done`}
            action={<ProgressRing value={setupPct} sizeClassName="size-12" />}
          >
            <div className="space-y-3">
              {checklist.map((item) => (
                <ChecklistItem
                  key={item.label}
                  label={item.label}
                  subtext={item.done ? undefined : item.subtext}
                  completed={item.done}
                />
              ))}
            </div>
            <Link
              href={`${base}/edit`}
              className="text-small text-primary focus-visible:ring-primary mt-4 inline-block rounded-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Finish in the editor →
            </Link>
          </ChartCard>
        )}
      </div>

      <p className="text-small text-text-secondary">
        Audio recording:{" "}
        <span className="text-text-primary font-medium">
          {event.audioRecordingEnabled
            ? `enabled for ${event.audioRecordingAppliesTo === "ATTENDEE" ? "Attendees" : "Participants"}`
            : "disabled"}
        </span>
        {" · "}Custom questions:{" "}
        <span className="text-text-primary font-medium">
          {event.questions.length}
        </span>
      </p>
    </div>
  );
}
