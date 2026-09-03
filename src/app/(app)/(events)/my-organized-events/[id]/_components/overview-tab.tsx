import { useState } from "react";
import { Progress, Switch } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import { Attendee } from "@/lib/attendees";
import { Event } from "@/lib/event";
import { updateEvent } from "@/lib/api/events";
import { RegistrationTrendChart } from "./registration-trend-chart";

export interface OverviewTabProps {
  event: Event;
  attendees: Attendee[];
  // Called after the runtime open/close toggle below writes successfully,
  // so the parent re-fetches and this tab re-renders with the new state.
  onEventChanged: () => void | Promise<void>;
}

// Days until this category's own registration deadline — falls back to the
// event's start date when the organizer hasn't set one.
function daysUntilClose(
  deadlineIso: string | null | undefined,
  fallbackDateStr: string,
): number | null {
  const target = new Date(deadlineIso || fallbackDateStr);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.round((target.getTime() - today.getTime()) / 86_400_000),
  );
}

function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OverviewTab({
  event,
  attendees,
  onEventChanged,
}: OverviewTabProps) {
  const [togglingCategory, setTogglingCategory] = useState<
    "ATTENDEE" | "PARTICIPANT" | null
  >(null);

  // Flips a pass open/closed at any time — including after
  // registration_deadline has passed — by reusing the plain PUT /events/:id
  // update call with just this one field set. No new endpoint needed.
  async function toggleRegistration(
    category: "ATTENDEE" | "PARTICIPANT",
    nextEnabled: boolean,
  ) {
    setTogglingCategory(category);
    try {
      await updateEvent(
        event.id,
        category === "ATTENDEE"
          ? { attendee_registration_enabled: nextEnabled ? 1 : 0 }
          : { participant_registration_enabled: nextEnabled ? 1 : 0 },
      );
      await onEventChanged();
    } finally {
      setTogglingCategory(null);
    }
  }

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const attendeeRegistration = event.attendeeRegistration;
  const attendeeRegisteredThisWeek = attendees.filter(
    (attendee) =>
      attendee.category === "Attendee" &&
      new Date(attendee.registeredAt) >= oneWeekAgo,
  ).length;
  const paidAttendeeCount = attendees.filter(
    (attendee) =>
      attendee.category === "Attendee" &&
      attendee.ticketType === "Paid" &&
      attendee.status !== "cancelled",
  ).length;
  const revenue = event.priceAmount ? event.priceAmount * paidAttendeeCount : 0;
  const capacityPercent = event.capacity
    ? Math.min(100, Math.round((event.registeredCount / event.capacity) * 100))
    : null;
  const remainingDays = daysUntilClose(
    attendeeRegistration.registrationDeadlineIso,
    event.date,
  );

  const participantRegistration = event.participantRegistration;
  const participantRegisteredThisWeek = attendees.filter(
    (attendee) =>
      attendee.category === "Participant" &&
      new Date(attendee.registeredAt) >= oneWeekAgo,
  ).length;
  const paidParticipantCount = attendees.filter(
    (attendee) =>
      attendee.category === "Participant" &&
      attendee.ticketType === "Paid" &&
      attendee.status !== "cancelled",
  ).length;
  const participantRevenue = participantRegistration.price
    ? participantRegistration.price * paidParticipantCount
    : 0;
  const participantCapacityPercent = participantRegistration.capacity
    ? Math.min(
        100,
        Math.round(
          (participantRegistration.registeredCount /
            participantRegistration.capacity) *
            100,
        ),
      )
    : null;
  const participantRemainingDays = daysUntilClose(
    participantRegistration.registrationDeadlineIso,
    event.date,
  );
  // Show the Participant stat block once it has ever had activity, even if
  // the organizer has since closed it — closing shouldn't hide history.
  const showParticipantStats =
    participantRegistration.enabled ||
    participantRegistration.registeredCount > 0;

  // Age category is only ever captured on the additional-info page, gated to
  // Participant-category rows — Attendee rows never have it.
  const participants = attendees.filter(
    (attendee) => attendee.category === "Participant",
  );
  const ageBreakdown: { label: string; value: number }[] = [
    {
      label: "Youngster (below 18)",
      value: participants.filter((p) => p.ageCategory === "YOUNGSTER").length,
    },
    {
      label: "Adult (18–60)",
      value: participants.filter((p) => p.ageCategory === "ADULT").length,
    },
    {
      label: "Senior Citizen (60 and above)",
      value: participants.filter((p) => p.ageCategory === "SENIOR").length,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-small text-text-secondary mb-1 flex items-center gap-2 font-bold tracking-widest uppercase">
          {attendeeRegistration.label}{" "}
          <span className="bg-border-light h-px flex-1" />
        </p>
        <p className="text-small text-text-secondary mb-3">
          Registration opened{" "}
          {formatDateTime(attendeeRegistration.registrationOpensIso) ??
            "immediately"}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Registered"
            value={event.registeredCount.toLocaleString()}
            sub={event.capacity ? `${event.capacity} capacity` : undefined}
            trend={
              attendeeRegisteredThisWeek > 0
                ? {
                    value: `+${attendeeRegisteredThisWeek} this week`,
                    tone: "success",
                  }
                : undefined
            }
          />
          <StatCard
            label="Revenue"
            value={event.priceAmount ? `₹${revenue.toLocaleString()}` : "₹0"}
            sub={
              event.priceAmount
                ? `${paidAttendeeCount} paid tickets`
                : "Free event"
            }
          />
          <div className="border-border-light bg-surface-light rounded-md border p-4 transition-shadow hover:shadow-md">
            <p className="text-small text-text-secondary font-medium tracking-wide uppercase">
              Capacity
            </p>
            <span className="text-heading text-text-primary mt-1 block font-extrabold">
              {capacityPercent !== null ? `${capacityPercent}%` : "Unlimited"}
            </span>
            {capacityPercent !== null && (
              <Progress
                value={capacityPercent}
                className="mt-2"
                label="Capacity filled"
              />
            )}
          </div>
          <StatCard
            label="Days Left"
            value={remainingDays !== null ? String(remainingDays) : "—"}
            sub={`Closes ${attendeeRegistration.registrationCloses}`}
          />
        </div>
      </div>

      {showParticipantStats && (
        <div>
          <p className="text-small text-text-secondary mb-1 flex items-center gap-2 font-bold tracking-widest uppercase">
            {participantRegistration.label}{" "}
            <span className="bg-border-light h-px flex-1" />
          </p>
          <p className="text-small text-text-secondary mb-3">
            Registration opened{" "}
            {formatDateTime(participantRegistration.registrationOpensIso) ??
              "immediately"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Registered"
              value={participantRegistration.registeredCount.toLocaleString()}
              sub={
                participantRegistration.capacity
                  ? `${participantRegistration.capacity} capacity`
                  : "Unlimited capacity"
              }
              trend={
                participantRegisteredThisWeek > 0
                  ? {
                      value: `+${participantRegisteredThisWeek} this week`,
                      tone: "success",
                    }
                  : undefined
              }
            />
            <StatCard
              label="Revenue"
              value={
                participantRegistration.price
                  ? `₹${participantRevenue.toLocaleString()}`
                  : "₹0"
              }
              sub={
                participantRegistration.price
                  ? `${paidParticipantCount} paid`
                  : "Free pass"
              }
            />
            <div className="border-border-light bg-surface-light rounded-md border p-4 transition-shadow hover:shadow-md">
              <p className="text-small text-text-secondary font-medium tracking-wide uppercase">
                Capacity
              </p>
              <span className="text-heading text-text-primary mt-1 block font-extrabold">
                {participantCapacityPercent !== null
                  ? `${participantCapacityPercent}%`
                  : "Unlimited"}
              </span>
              {participantCapacityPercent !== null && (
                <Progress
                  value={participantCapacityPercent}
                  className="mt-2"
                  label="Capacity filled"
                />
              )}
            </div>
            <StatCard
              label="Days Left"
              value={
                participantRemainingDays !== null
                  ? String(participantRemainingDays)
                  : "—"
              }
              sub={`Closes ${participantRegistration.registrationCloses}`}
            />
          </div>
          <p className="text-small text-text-secondary mt-4 mb-1 font-medium">
            Age Breakdown
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {ageBreakdown.map((bracket) => (
              <StatCard
                key={bracket.label}
                label={bracket.label}
                value={bracket.value.toLocaleString()}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-small text-text-secondary mb-3 flex items-center gap-2 font-bold tracking-widest uppercase">
          Registration <span className="bg-border-light h-px flex-1" />
        </p>
        <div className="border-border-light bg-surface-light flex flex-wrap gap-6 rounded-md border p-4">
          <Switch
            label={`${event.attendeeRegistration.label} pass: ${event.attendeeRegistration.enabled ? "Open" : "Closed"}`}
            checked={event.attendeeRegistration.enabled}
            disabled={togglingCategory !== null}
            onChange={(e) => toggleRegistration("ATTENDEE", e.target.checked)}
          />
          {showParticipantStats && (
            <Switch
              label={`${event.participantRegistration.label} pass: ${event.participantRegistration.enabled ? "Open" : "Closed"}`}
              checked={event.participantRegistration.enabled}
              disabled={togglingCategory !== null}
              onChange={(e) =>
                toggleRegistration("PARTICIPANT", e.target.checked)
              }
            />
          )}
        </div>
        <p className="text-small text-text-secondary mt-2">
          Closing a pass stops new registrations immediately — works any time,
          even after the registration deadline has passed.
        </p>
      </div>

      <div>
        <p className="text-small text-text-secondary mb-3 flex items-center gap-2 font-bold tracking-widest uppercase">
          Additional Information <span className="bg-border-light h-px flex-1" />
        </p>
        <div className="border-border-light bg-surface-light space-y-2 rounded-md border p-4">
          <p className="text-body text-text-primary">
            Audio recording:{" "}
            <span className="font-medium">
              {event.audioRecordingEnabled ? "Enabled" : "Disabled"}
            </span>
          </p>
          <p className="text-body text-text-primary">
            Track submission:{" "}
            <span className="font-medium">
              {event.trackSubmissionEnabled ? "Enabled" : "Disabled"}
            </span>
          </p>
          <p className="text-body text-text-primary">
            Team member names:{" "}
            <span className="font-medium">
              {event.memberNamesEnabled ? "Enabled" : "Disabled"}
            </span>
          </p>
          <p className="text-body text-text-primary">
            Age category:{" "}
            <span className="font-medium">
              {
                { OFF: "Off", OPTIONAL: "Optional", REQUIRED: "Required" }[
                  event.ageCategoryRequirement
                ]
              }
            </span>
          </p>
        </div>
      </div>

      <RegistrationTrendChart attendees={attendees} />
    </div>
  );
}
