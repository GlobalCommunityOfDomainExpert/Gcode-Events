"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarDays,
  ChevronDown,
  Clock,
  ExternalLink,
  Layers,
  Link2,
  Navigation,
  Plus,
  Trash2,
  Upload,
  UsersRound,
  Video,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { Button, Icon, Input } from "@/components/atoms";
import { FormField } from "@/components/molecules";
import { stageWhen } from "@/lib/event-stages";
import type { EventStageData } from "@/lib/zod/event";

type Mode = EventStageData["mode"];
type Cta = EventStageData["cta"];

const MODES: { value: Mode; label: string; icon: LucideIcon }[] = [
  { value: "ONLINE", label: "Online", icon: Video },
  { value: "OFFLINE", label: "In person", icon: UsersRound },
  { value: "BOTH", label: "Both", icon: Layers },
];

const MODE_SHORT: Record<Mode, string> = {
  ONLINE: "Online",
  OFFLINE: "In person",
  BOTH: "Online + in person",
};

const CTAS: { value: Cta; label: string; text: string; icon: LucideIcon }[] = [
  { value: "AUTO", label: "Automatic", text: "Join / directions", icon: Wand2 },
  {
    value: "SUBMIT",
    label: "Submit entry",
    text: "Clip + questions",
    icon: Upload,
  },
  { value: "LINK", label: "Custom link", text: "Any URL", icon: ExternalLink },
];

/** The main button a stage gets with no custom text — null = no button. */
function defaultLabel(stage: EventStageData): string | null {
  if (stage.cta === "SUBMIT") return "Submit entry";
  if (stage.cta === "LINK") return "Open link";
  if (stage.mode !== "OFFLINE" && stage.link.trim()) return "Join meeting";
  if (stage.mode !== "ONLINE") return "Get directions";
  return null;
}

const newStage = (n: number, prev?: EventStageData): EventStageData => ({
  label: `Day ${n}`,
  date: "",
  time: prev?.time ?? "",
  // Alternate by default: online → in person is the common shape.
  mode: prev?.mode === "ONLINE" ? "OFFLINE" : "ONLINE",
  link: "",
  venue: "",
  cta: "AUTO",
  ctaLabel: "",
  ctaUrl: "",
});

/**
 * Hybrid events rarely mean "online and in person at the same time". More
 * often it's Day 1 online, Day 2 at the venue — or a talent show whose first
 * round is an online video screening. Each stage is a collapsible card with
 * three groups — When, Where, Button — and the event page shows a picker
 * that opens on the current stage.
 */
export function HybridStagesField({
  stages,
  venue,
  onChange,
}: {
  stages: EventStageData[];
  /** Event venue — the default for in-person stages. */
  venue: string;
  onChange: (stages: EventStageData[]) => void;
}) {
  const [open, setOpen] = useState<number | null>(stages.length > 0 ? 0 : null);

  const patch = (i: number, p: Partial<EventStageData>) =>
    onChange(stages.map((s, j) => (j === i ? { ...s, ...p } : s)));

  const add = () => {
    onChange([
      ...stages,
      newStage(stages.length + 1, stages[stages.length - 1]),
    ]);
    setOpen(stages.length);
  };

  const remove = (i: number) => {
    onChange(stages.filter((_, j) => j !== i));
    setOpen(null);
  };

  const move = (i: number, dir: -1 | 1) => {
    const t = i + dir;
    if (t < 0 || t >= stages.length) return;
    const next = [...stages];
    [next[i], next[t]] = [next[t], next[i]];
    onChange(next);
    setOpen(t);
  };

  return (
    <section className="border-border-light space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-body text-text-primary font-semibold">
            Days &amp; format
          </h3>
          <p className="text-small text-text-secondary">
            Split the event into days or rounds — each online, in person or
            both, with its own button.
          </p>
        </div>
        {stages.length > 0 && (
          <Button type="button" variant="secondary" size="sm" onClick={add}>
            <Icon icon={Plus} size="sm" />
            Add day
          </Button>
        )}
      </div>

      {stages.length === 0 ? (
        <button
          type="button"
          onClick={add}
          className="border-border-light hover:border-primary hover:bg-primary-light/40 text-text-secondary flex w-full flex-col items-center gap-1 rounded-md border border-dashed px-4 py-6 text-center transition-colors"
        >
          <Icon icon={Plus} size="sm" className="text-primary" />
          <span className="text-body text-text-primary font-semibold">
            Split into days
          </span>
          <span className="text-small">
            e.g. Round 1 online, finals at the venue
          </span>
        </button>
      ) : (
        <ol className="space-y-2">
          {stages.map((stage, i) => (
            <StageCard
              key={i}
              index={i}
              count={stages.length}
              stage={stage}
              venue={venue}
              open={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
              onPatch={(p) => patch(i, p)}
              onMove={(dir) => move(i, dir)}
              onRemove={() => remove(i)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function StageCard({
  index: i,
  count,
  stage,
  venue,
  open,
  onToggle,
  onPatch,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  stage: EventStageData;
  venue: string;
  open: boolean;
  onToggle: () => void;
  onPatch: (p: Partial<EventStageData>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const id = `stage-${i}`;
  const online = stage.mode !== "OFFLINE";
  const inPerson = stage.mode !== "ONLINE";
  const hasLink = online && stage.link.trim() !== "";
  const fallback = defaultLabel(stage);
  const buttonText = stage.ctaLabel.trim() || fallback;
  const modeIcon = MODES.find((m) => m.value === stage.mode)!.icon;
  const name = stage.label.trim() || `Day ${i + 1}`;

  return (
    <li
      className={`bg-surface-light @container overflow-hidden rounded-md border transition-colors ${open ? "border-primary/40 shadow-sm" : "border-border-light"}`}
    >
      {/* summary — always visible, click to open */}
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="bg-primary-light text-primary grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-body text-text-primary block truncate font-semibold">
              {name}
            </span>
            <span className="text-small text-text-secondary flex flex-wrap items-center gap-x-2">
              <span className="inline-flex items-center gap-1">
                <Icon icon={modeIcon} size="sm" className="size-3.5" />
                {MODE_SHORT[stage.mode]}
              </span>
              <span aria-hidden>·</span>
              <span>{stageWhen(stage)}</span>
              {buttonText && (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-text-primary font-medium">
                    {`“${buttonText}”`}
                  </span>
                </>
              )}
            </span>
          </span>
          <Icon
            icon={ChevronDown}
            size="sm"
            className={`text-text-secondary size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        <div className="flex shrink-0 items-center">
          <IconBtn
            icon={ArrowUp}
            label={`Move ${name} up`}
            disabled={i === 0}
            onClick={() => onMove(-1)}
          />
          <IconBtn
            icon={ArrowDown}
            label={`Move ${name} down`}
            disabled={i === count - 1}
            onClick={() => onMove(1)}
          />
          <IconBtn
            icon={Trash2}
            label={`Remove ${name}`}
            danger
            onClick={onRemove}
          />
        </div>
      </div>

      {open && (
        <div
          id={`${id}-body`}
          className="border-border-light divide-border-light divide-y border-t"
        >
          <Group title="When">
            <FormField label="Name" htmlFor={`${id}-label`}>
              <Input
                id={`${id}-label`}
                value={stage.label}
                onChange={(e) => onPatch({ label: e.target.value })}
                placeholder={`Day ${i + 1}`}
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Date"
                htmlFor={`${id}-date`}
                hint="Blank = to be announced"
              >
                <Input
                  id={`${id}-date`}
                  icon={CalendarDays}
                  type="date"
                  value={stage.date}
                  onChange={(e) => onPatch({ date: e.target.value })}
                />
              </FormField>
              <FormField label="Time" htmlFor={`${id}-time`}>
                <Input
                  id={`${id}-time`}
                  icon={Clock}
                  type="time"
                  value={stage.time}
                  onChange={(e) => onPatch({ time: e.target.value })}
                />
              </FormField>
            </div>
          </Group>

          <Group title="Where">
            <Segmented
              id={`${id}-mode`}
              label="Format"
              options={MODES}
              value={stage.mode}
              onChange={(mode) => onPatch({ mode })}
            />
            {online && (
              <FormField
                label="Meeting link"
                htmlFor={`${id}-link`}
                hint="Optional — blank when there's nothing to join live, like a video screening. Only ticket holders see it."
              >
                <Input
                  id={`${id}-link`}
                  icon={Link2}
                  value={stage.link}
                  onChange={(e) => onPatch({ link: e.target.value })}
                  placeholder="https://meet.google.com/…"
                />
              </FormField>
            )}
            {inPerson && (
              <FormField
                label="Venue"
                htmlFor={`${id}-venue`}
                hint="Blank = the event venue."
              >
                <Input
                  id={`${id}-venue`}
                  icon={Building2}
                  value={stage.venue}
                  onChange={(e) => onPatch({ venue: e.target.value })}
                  placeholder={venue || "Event venue"}
                />
              </FormField>
            )}
          </Group>

          <Group title="Button">
            <div
              id={`${id}-cta`}
              role="radiogroup"
              aria-label="Button action"
              className="grid gap-2 @md:grid-cols-3"
            >
              {CTAS.map((c) => {
                const active = stage.cta === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onPatch({ cta: c.value })}
                    className={`flex items-start gap-2 rounded-md border p-3 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary-light/50"
                        : "border-border-light hover:border-border-hover"
                    }`}
                  >
                    <Icon
                      icon={c.icon}
                      size="sm"
                      className={`mt-0.5 size-4 shrink-0 ${active ? "text-primary" : "text-text-secondary"}`}
                    />
                    <span className="min-w-0">
                      <span className="text-small text-text-primary block font-semibold">
                        {c.label}
                      </span>
                      <span className="text-text-secondary block text-xs">
                        {c.text}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {stage.cta === "LINK" && (
              <FormField label="Link" htmlFor={`${id}-cta-url`}>
                <Input
                  id={`${id}-cta-url`}
                  icon={Link2}
                  value={stage.ctaUrl}
                  onChange={(e) => onPatch({ ctaUrl: e.target.value })}
                  placeholder="https://… — a form, a brief, a portal"
                />
              </FormField>
            )}

            {fallback ? (
              <FormField
                label="Button text"
                htmlFor={`${id}-cta-label`}
                hint={
                  stage.cta === "SUBMIT"
                    ? `Blank = “${fallback}”. Ticket holders go to their entry form; others see Register to submit.`
                    : `Blank = “${fallback}”. Write anything — “Watch the stream”, “Read the brief”.`
                }
              >
                <Input
                  id={`${id}-cta-label`}
                  value={stage.ctaLabel}
                  maxLength={32}
                  onChange={(e) => onPatch({ ctaLabel: e.target.value })}
                  placeholder={fallback}
                />
              </FormField>
            ) : (
              <p className="text-small text-text-secondary">
                No button yet — this day is online with no meeting link. Add a
                link above, or pick Submit entry or Custom link.
              </p>
            )}

            {/* what attendees will see for this day */}
            {buttonText && (
              <div className="bg-bg-light flex flex-wrap items-center gap-2 rounded-md px-3 py-2">
                <span className="text-text-secondary text-xs font-semibold tracking-wide uppercase">
                  Attendees see
                </span>
                <span className="bg-primary text-small inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-semibold text-white">
                  {buttonText}
                </span>
                {stage.cta !== "AUTO" && hasLink && (
                  <PreviewChip icon={Video} text="Join meeting" />
                )}
                {(stage.cta !== "AUTO" || hasLink) && inPerson && (
                  <PreviewChip icon={Navigation} text="Get directions" />
                )}
              </div>
            )}
          </Group>
        </div>
      )}
    </li>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 p-4 @xl:grid-cols-[5.5rem_minmax(0,1fr)]">
      <p className="text-text-secondary text-xs font-bold tracking-wider uppercase @xl:pt-1">
        {title}
      </p>
      <div className="min-w-0 space-y-3">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: { value: T; label: string; icon: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      className="bg-bg-light border-border-light grid h-11 grid-cols-3 gap-1 rounded-sm border p-1"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`text-small flex items-center justify-center gap-1.5 rounded-sm px-2 font-medium whitespace-nowrap transition-colors ${
              active
                ? "bg-primary text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <Icon icon={o.icon} size="sm" className="size-4" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function PreviewChip({ icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <span className="border-border-light bg-surface-light text-text-primary text-small inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-semibold">
      <Icon icon={icon} size="sm" className="size-3.5" />
      {text}
    </span>
  );
}

function IconBtn({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`text-text-secondary grid size-8 place-items-center rounded-sm transition-colors disabled:pointer-events-none disabled:opacity-30 ${danger ? "hover:text-danger hover:bg-danger/10" : "hover:text-text-primary hover:bg-bg-light"}`}
    >
      <Icon icon={icon} size="sm" className="size-4" />
    </button>
  );
}
