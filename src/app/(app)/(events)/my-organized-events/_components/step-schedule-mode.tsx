import { useState } from "react";
import {
  Building2,
  CalendarDays,
  Clock,
  Hourglass,
  Layers,
  Link2,
  MapPin,
  UsersRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Icon, Input } from "@/components/atoms";
import { FormField } from "@/components/molecules";
import { useLookup } from "@/hooks/use-lookup";
import { getModes } from "@/lib/api/lookups";
import { EventModeLookup } from "@/lib/api/types";
import { UpdateEventDetailData, EventDetailData } from "@/lib/zod/event";

// Known DB mode_name codes get friendlier copy; anything else falls back to the raw name.
const KNOWN_MODE_LABEL: Record<string, string> = {
  ONLINE: "Online",
  PHYSICAL: "In-Person",
  HYBRID: "Hybrid",
};

const MODE_ICON: Record<string, LucideIcon> = {
  ONLINE: Video,
  PHYSICAL: UsersRound,
  HYBRID: Layers,
};

// In-Person first — the most common choice leads.
const MODE_ORDER = ["PHYSICAL", "ONLINE", "HYBRID"];

export interface StepScheduleModeProps {
  data: EventDetailData;
  onChange: UpdateEventDetailData;
}

export function StepScheduleMode({ data, onChange }: StepScheduleModeProps) {
  const { status, data: modes } = useLookup(getModes);
  const activeMode = modes.find((mode) => mode.id === data.mode);
  const modeCode = activeMode?.mode_name ?? "";
  // An empty link means the GCODE live room. Starts on "own link" when the
  // event already has one.
  const [joinChoice, setJoinChoice] = useState<"gcode" | "own">(
    data.participationLink.trim() ? "own" : "gcode",
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-large text-text-primary font-semibold">
          Schedule &amp; mode
        </h2>
        <p className="text-body text-text-secondary">
          When and how attendees will join.
        </p>
      </div>

      {status === "error" && (
        <p className="text-small text-danger">
          Couldn&apos;t load event modes. Refresh to try again.
        </p>
      )}

      <FormField label="Mode" htmlFor="event-mode">
        <div
          id="event-mode"
          role="radiogroup"
          className="bg-bg-light border-border-light grid auto-cols-fr grid-flow-col gap-1 rounded-md border p-1"
        >
          {[...modes]
            .sort(
              (a, b) =>
                MODE_ORDER.indexOf(a.mode_name) -
                MODE_ORDER.indexOf(b.mode_name),
            )
            .map((mode: EventModeLookup) => {
              const active = mode.id === data.mode;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange("mode", mode.id)}
                  className={`text-small flex h-10 items-center justify-center gap-2 rounded-sm font-medium transition-colors ${
                    active
                      ? "bg-surface-light text-text-primary border-primary/70 border shadow-sm"
                      : "text-text-secondary hover:text-text-primary border border-transparent"
                  }`}
                >
                  {MODE_ICON[mode.mode_name] && (
                    <Icon icon={MODE_ICON[mode.mode_name]} size="sm" />
                  )}
                  {KNOWN_MODE_LABEL[mode.mode_name] ?? mode.mode_name}
                </button>
              );
            })}
        </div>
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Date"
          htmlFor="event-date"
          hint="Leave blank to show as Coming Soon — set it later once confirmed."
        >
          <Input
            id="event-date"
            icon={CalendarDays}
            type="date"
            value={data.date}
            onChange={(event) => onChange("date", event.target.value)}
          />
        </FormField>
        <FormField
          label="Time"
          htmlFor="event-time"
          hint="Leave blank to show as TBD."
        >
          <Input
            id="event-time"
            icon={Clock}
            type="time"
            value={data.time}
            onChange={(event) => onChange("time", event.target.value)}
          />
        </FormField>
      </div>

      {(modeCode === "PHYSICAL" || modeCode === "HYBRID") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="City" htmlFor="event-city">
            <Input
              id="event-city"
              icon={MapPin}
              value={data.city}
              onChange={(event) => onChange("city", event.target.value)}
              placeholder="e.g. Bangalore"
            />
          </FormField>
          <FormField label="Venue address" htmlFor="event-location">
            <Input
              id="event-location"
              icon={Building2}
              value={data.location}
              onChange={(event) => onChange("location", event.target.value)}
              placeholder="e.g. GCODE Campus"
            />
          </FormField>
        </div>
      )}

      {data.stages.length > 0 && (
        <p className="text-small text-text-secondary bg-bg-light rounded-md px-3 py-2">
          This event is split into {data.stages.length} days in{" "}
          <strong className="text-text-primary">Agenda</strong> — each day has
          its own link, venue and button there.
        </p>
      )}

      {modeCode === "ONLINE" && data.stages.length === 0 && (
        <FormField
          label="How will people join?"
          htmlFor="event-join-choice"
          hint={
            joinChoice === "gcode"
              ? "Registered attendees join from the event page with their ticket. No link to share."
              : "Shared with registrants after they sign up."
          }
        >
          <div
            id="event-join-choice"
            role="radiogroup"
            className="grid gap-2 sm:grid-cols-2"
          >
            {(
              [
                ["gcode", "GCODE live room", "We host it. No link needed."],
                ["own", "My own link", "Zoom, Meet, Teams, YouTube..."],
              ] as const
            ).map(([value, title, sub]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={joinChoice === value}
                onClick={() => {
                  setJoinChoice(value);
                  if (value === "gcode") onChange("participationLink", "");
                }}
                className={`rounded-md border p-3 text-left transition-colors ${joinChoice === value ? "border-primary bg-primary/5 ring-primary/15 ring-2" : "border-border-light hover:border-border-hover"}`}
              >
                <span className="text-small text-text-primary block font-semibold">
                  {title}
                </span>
                <span className="text-small text-text-secondary block">
                  {sub}
                </span>
              </button>
            ))}
          </div>
          {joinChoice === "own" && (
            <div className="mt-3">
              <Input
                id="event-participation-link"
                icon={Link2}
                value={data.participationLink}
                onChange={(event) =>
                  onChange("participationLink", event.target.value)
                }
                placeholder="https://..."
                aria-label="Meeting link"
              />
              {!data.participationLink.trim() && (
                <p className="text-small text-text-secondary mt-1">
                  Paste your link, or switch to the GCODE live room. With no
                  link the event uses the GCODE live room.
                </p>
              )}
            </div>
          )}
        </FormField>
      )}

      {modeCode === "HYBRID" && data.stages.length === 0 && (
        <FormField
          label="Participation link"
          htmlFor="event-participation-link"
        >
          <Input
            id="event-participation-link"
            icon={Link2}
            value={data.participationLink}
            onChange={(event) =>
              onChange("participationLink", event.target.value)
            }
            placeholder="Shared with registrants after they sign up"
          />
        </FormField>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Duration"
          htmlFor="event-duration"
          hint="Shown in place of Time on the event page when Time is left blank."
        >
          <Input
            id="event-duration"
            icon={Hourglass}
            value={data.duration}
            onChange={(event) => onChange("duration", event.target.value)}
            placeholder="e.g. 3 hours"
          />
        </FormField>
      </div>
    </div>
  );
}
