"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Gavel,
  MapPin,
  Plus,
  Trash2,
  Trophy,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Icon, Input, Switch, Textarea } from "@/components/atoms";
import { FormField } from "@/components/molecules";
import type { EventDetailData } from "@/lib/zod/event";

type Round = EventDetailData["rounds"][number];
type Criterion = Round["rubric"][number];

// Dashboard round editor. Left: the rounds as a pipeline (order, mode, date,
// how it's decided, problems). Right: the selected round, grouped the way an
// organizer thinks about it — what it is, when, how it's scored, who moves on.
// Same data as the old wizard step (EventDetailData["rounds"]).

const blankRound = (): Round => ({
  id: null,
  name: "",
  description: "",
  mode: "OFFLINE",
  rubric: [],
  shortlistCount: 0,
  date: "",
  startTime: "",
  endTime: "",
  judgeWeight: 70,
  audienceWeight: 30,
  judgeScoringEnabled: false,
  audienceScoringEnabled: false,
});

function judges(r: Round) {
  return r.mode === "ONLINE" || r.judgeScoringEnabled;
}
function audience(r: Round) {
  return r.mode === "OFFLINE" && r.audienceScoringEnabled;
}
function scored(r: Round) {
  return r.mode === "ONLINE" ? r.rubric.length > 0 : judges(r) || audience(r);
}

export function roundProblems(r: Round): string[] {
  const out: string[] = [];
  if (!r.name.trim()) out.push("Needs a name");
  if (
    r.mode === "OFFLINE" &&
    r.judgeScoringEnabled &&
    r.rubric.filter((c) => c.label.trim()).length === 0
  )
    out.push("Judge scoring is on but there are no criteria");
  if (r.startTime && r.endTime && r.endTime <= r.startTime)
    out.push("Ends before it starts");
  return out;
}

function decidedBy(r: Round): string {
  const parts = [
    judges(r) &&
      (r.rubric.length
        ? "Judges"
        : r.mode === "ONLINE"
          ? "Manual pick"
          : "Judges"),
    audience(r) && "Audience",
  ].filter(Boolean) as string[];
  const how = parts.length ? parts.join(" + ") : "Manual pick";
  return r.shortlistCount > 0 ? `${how} · top ${r.shortlistCount}` : how;
}

const fmtDate = (d: string) =>
  d
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
      }).format(new Date(`${d}T00:00:00`))
    : "No date";

export function RoundsEditor({
  rounds,
  onChange,
}: {
  rounds: Round[];
  onChange: (next: Round[]) => void;
}) {
  const [sel, setSel] = useState(0);
  const i = Math.min(sel, Math.max(0, rounds.length - 1));
  const round = rounds[i];

  const patch = (index: number, p: Partial<Round>) =>
    onChange(rounds.map((r, k) => (k === index ? { ...r, ...p } : r)));

  function add() {
    onChange([...rounds, blankRound()]);
    setSel(rounds.length);
  }
  function remove(index: number) {
    onChange(rounds.filter((_, k) => k !== index));
    setSel(Math.max(0, index - 1));
  }
  function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= rounds.length) return;
    const next = [...rounds];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
    setSel(to);
  }

  if (rounds.length === 0) {
    return (
      <div className="border-border-light flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
        <span className="bg-primary-light text-primary flex size-11 items-center justify-center rounded-full">
          <Icon icon={Trophy} size="md" />
        </span>
        <div>
          <p className="text-text-primary font-semibold">No rounds yet</p>
          <p className="text-small text-text-secondary mt-1 max-w-md">
            Add a round for each stage participants go through — for example an
            online screening, then a live final.
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          className="bg-primary hover:bg-primary-hover text-small inline-flex h-9 items-center gap-2 rounded-sm px-4 font-semibold text-white"
        >
          <Icon icon={Plus} size="sm" className="size-4" /> Add the first round
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* ----------------------------------------------------- pipeline */}
      <div>
        <p className="text-text-secondary mb-2 text-xs font-semibold tracking-wider uppercase">
          {rounds.length} round{rounds.length > 1 ? "s" : ""} · in order
        </p>
        <ol className="space-y-2">
          {rounds.map((r, k) => {
            const active = k === i;
            const problems = roundProblems(r);
            const last = k === rounds.length - 1;
            return (
              <li key={k} className="relative">
                {!last && (
                  <span
                    aria-hidden
                    className="bg-border-light absolute top-11 -bottom-2 left-[1.6rem] w-px"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setSel(k)}
                  aria-current={active ? "true" : undefined}
                  className={`relative flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    active
                      ? "border-primary bg-surface-light shadow-sm ring-2 ring-[color-mix(in_srgb,var(--color-primary)_12%,transparent)]"
                      : "border-border-light bg-surface-light hover:border-border-hover"
                  }`}
                >
                  <span
                    className={`text-small flex size-7 shrink-0 items-center justify-center rounded-full font-bold ${
                      active
                        ? "bg-primary text-white"
                        : "bg-bg-light text-text-secondary"
                    }`}
                  >
                    {k + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-small text-text-primary block truncate font-semibold">
                      {r.name.trim() || "Untitled round"}
                    </span>
                    <span className="text-text-secondary mt-0.5 flex items-center gap-1 text-xs">
                      <Icon
                        icon={r.mode === "ONLINE" ? Video : MapPin}
                        size="sm"
                        className="size-3"
                      />
                      {r.mode === "ONLINE" ? "Online" : "In person"} ·{" "}
                      {fmtDate(r.date)}
                    </span>
                    <span className="text-text-secondary mt-0.5 block truncate text-xs">
                      {last ? "Final · " : ""}
                      {decidedBy(r)}
                    </span>
                  </span>
                  {problems.length > 0 && (
                    <Icon
                      icon={CircleAlert}
                      size="sm"
                      className="text-warning mt-0.5 size-4 shrink-0"
                      aria-label={problems.join(", ")}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={add}
          className="border-border-light text-text-secondary hover:border-border-hover hover:text-text-primary text-small mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-2.5 font-semibold transition-colors"
        >
          <Icon icon={Plus} size="sm" className="size-4" /> Add round
        </button>
      </div>

      {/* ------------------------------------------------ selected round */}
      {round && (
        <RoundForm
          key={i}
          index={i}
          total={rounds.length}
          round={round}
          onPatch={(p) => patch(i, p)}
          onMove={(by) => move(i, by)}
          onRemove={() => remove(i)}
        />
      )}
    </div>
  );
}

function RoundForm({
  index,
  total,
  round: r,
  onPatch,
  onMove,
  onRemove,
}: {
  index: number;
  total: number;
  round: Round;
  onPatch: (p: Partial<Round>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const id = (s: string) => `round-${index}-${s}`;
  const problems = roundProblems(r);
  const isFinal = index === total - 1;
  const rubricTotal = r.rubric.reduce(
    (s, c) => s + (Number(c.maxScore) || 0),
    0,
  );
  const both =
    r.mode === "OFFLINE" && r.judgeScoringEnabled && r.audienceScoringEnabled;

  const setCriterion = (k: number, p: Partial<Criterion>) =>
    onPatch({ rubric: r.rubric.map((c, j) => (j === k ? { ...c, ...p } : c)) });

  return (
    <div className="border-border-light bg-surface-light min-w-0 rounded-lg border shadow-sm">
      {/* header */}
      <div className="border-border-light flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="min-w-0">
          <p className="text-text-secondary text-xs font-semibold tracking-wider uppercase">
            Round {index + 1} of {total}
            {isFinal && total > 1 ? " · final" : ""}
          </p>
          <p className="text-text-primary truncate font-bold">
            {r.name.trim() || "Untitled round"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn
            icon={ArrowUp}
            label="Move earlier"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          />
          <IconBtn
            icon={ArrowDown}
            label="Move later"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          />
          <IconBtn
            icon={Trash2}
            label="Remove round"
            danger
            onClick={onRemove}
          />
        </div>
      </div>

      {problems.length > 0 && (
        <div className="border-border-light flex items-start gap-2 border-b bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] px-5 py-2.5">
          <Icon
            icon={CircleAlert}
            size="sm"
            className="text-warning mt-0.5 size-4 shrink-0"
          />
          <p className="text-small text-text-primary">{problems.join(" · ")}</p>
        </div>
      )}

      <div className="divide-border-light divide-y">
        {/* basics */}
        <Group title="Basics">
          <FormField label="Name" htmlFor={id("name")}>
            <Input
              id={id("name")}
              value={r.name}
              onChange={(e) => onPatch({ name: e.target.value })}
              placeholder={
                index === 0
                  ? "e.g. Online screening"
                  : isFinal
                    ? "e.g. Grand finale"
                    : "e.g. Semi final"
              }
            />
          </FormField>
          <FormField
            label="What happens"
            htmlFor={id("desc")}
            hint="Participants see this on their ticket page."
          >
            <Textarea
              id={id("desc")}
              rows={2}
              value={r.description}
              onChange={(e) => onPatch({ description: e.target.value })}
              placeholder="e.g. Judges listen to every audition; the top 20 go through."
            />
          </FormField>
          <div>
            <p className="text-small text-text-primary mb-2 font-medium">
              Where it happens
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <ModeCard
                icon={Video}
                title="Online"
                hint="Participants submit; judges score from anywhere."
                active={r.mode === "ONLINE"}
                onClick={() => onPatch({ mode: "ONLINE" })}
              />
              <ModeCard
                icon={MapPin}
                title="In person"
                hint="Performed live; judges and audience score on the night."
                active={r.mode === "OFFLINE"}
                onClick={() => onPatch({ mode: "OFFLINE" })}
              />
            </div>
          </div>
        </Group>

        {/* when */}
        <Group
          title="When"
          hint={
            r.mode === "ONLINE"
              ? "The day judging closes and results are due."
              : "The day and time of the live round."
          }
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <FormField
              label={r.mode === "ONLINE" ? "Results by" : "Date"}
              htmlFor={id("date")}
            >
              <Input
                id={id("date")}
                type="date"
                value={r.date}
                onChange={(e) => onPatch({ date: e.target.value })}
              />
            </FormField>
            <FormField label="Starts" htmlFor={id("start")}>
              <Input
                id={id("start")}
                type="time"
                value={r.startTime}
                onChange={(e) => onPatch({ startTime: e.target.value })}
              />
            </FormField>
            <FormField label="Ends" htmlFor={id("end")}>
              <Input
                id={id("end")}
                type="time"
                value={r.endTime}
                onChange={(e) => onPatch({ endTime: e.target.value })}
              />
            </FormField>
          </div>
        </Group>

        {/* scoring */}
        <Group title="How it's scored">
          {r.mode === "OFFLINE" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleCard
                icon={Gavel}
                title="Judges score"
                hint="Against your criteria, from the judging screen."
                checked={r.judgeScoringEnabled}
                onChange={(v) => onPatch({ judgeScoringEnabled: v })}
              />
              <ToggleCard
                icon={Users}
                title="Audience rates"
                hint="From their phones, by scanning a QR on the night."
                checked={r.audienceScoringEnabled}
                onChange={(v) => onPatch({ audienceScoringEnabled: v })}
              />
            </div>
          ) : (
            <p className="text-small text-text-secondary">
              Judges review submissions online. Add criteria to score them, or
              leave it empty to pick by hand.
            </p>
          )}

          {r.mode === "OFFLINE" &&
            !r.judgeScoringEnabled &&
            !r.audienceScoringEnabled && (
              <p className="text-small text-text-secondary bg-bg-light rounded-md px-3 py-2">
                No scoring — you&apos;ll shortlist participants by hand, with no
                ranking.
              </p>
            )}

          {judges(r) && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-small text-text-primary font-medium">
                  Judging criteria
                </p>
                {r.rubric.length > 0 && (
                  <p className="text-text-secondary text-xs">
                    Out of{" "}
                    <strong className="text-text-primary">{rubricTotal}</strong>{" "}
                    points
                  </p>
                )}
              </div>
              {r.rubric.length > 0 && (
                <div className="border-border-light overflow-hidden rounded-md border">
                  <div className="bg-bg-light text-text-secondary grid grid-cols-[minmax(0,1fr)_6rem_2.25rem] gap-2 px-3 py-1.5 text-xs font-semibold">
                    <span>Criterion</span>
                    <span>Max points</span>
                    <span />
                  </div>
                  {r.rubric.map((c, k) => (
                    <div
                      key={k}
                      className="border-border-light grid grid-cols-[minmax(0,1fr)_6rem_2.25rem] items-center gap-2 border-t px-3 py-2"
                    >
                      <Input
                        aria-label={`Criterion ${k + 1}`}
                        value={c.label}
                        onChange={(e) =>
                          setCriterion(k, { label: e.target.value })
                        }
                        placeholder="e.g. Stage presence"
                      />
                      <Input
                        aria-label={`Max points for criterion ${k + 1}`}
                        type="number"
                        min={1}
                        value={c.maxScore}
                        onChange={(e) =>
                          setCriterion(k, {
                            maxScore: Math.max(1, Number(e.target.value)),
                          })
                        }
                      />
                      <IconBtn
                        icon={Trash2}
                        label={`Remove criterion ${k + 1}`}
                        danger
                        onClick={() =>
                          onPatch({
                            rubric: r.rubric.filter((_, j) => j !== k),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onPatch({
                      rubric: [
                        ...r.rubric,
                        { id: null, label: "", maxScore: 10 },
                      ],
                    })
                  }
                  className="text-small text-primary inline-flex items-center gap-1 font-semibold hover:underline"
                >
                  <Icon icon={Plus} size="sm" className="size-3.5" /> Add
                  criterion
                </button>
                {r.rubric.length === 0 &&
                  ["Talent", "Stage presence", "Originality"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        onPatch({
                          rubric: [
                            ...r.rubric,
                            { id: null, label: s, maxScore: 10 },
                          ],
                        })
                      }
                      className="border-border-light text-text-secondary hover:border-border-hover hover:text-text-primary rounded-full border px-2.5 py-0.5 text-xs"
                    >
                      + {s}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {both && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-primary">Judges {r.judgeWeight}%</span>
                <span className="text-secondary">
                  Audience {r.audienceWeight}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={r.judgeWeight}
                aria-label="Judge weight"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onPatch({ judgeWeight: v, audienceWeight: 100 - v });
                }}
                className="accent-primary w-full"
              />
              <p className="text-text-secondary text-xs">
                How the two blend into the final score for this round.
              </p>
            </div>
          )}
        </Group>

        {/* shortlist */}
        <Group title={isFinal && total > 1 ? "Winners" : "Who moves on"}>
          {scored(r) ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-small text-text-primary">
                  {isFinal && total > 1
                    ? "Pick winners automatically"
                    : "Shortlist automatically"}
                </p>
                <p className="text-text-secondary text-xs">
                  {r.shortlistCount > 0
                    ? `Once everyone is scored, the top ${r.shortlistCount} ${isFinal && total > 1 ? "are placed" : "move on"}.`
                    : "Off — you'll see everyone ranked and choose yourself."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {r.shortlistCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="text-small text-text-secondary">Top</span>
                    <span className="w-20">
                      <Input
                        aria-label="How many move on"
                        type="number"
                        min={1}
                        value={r.shortlistCount}
                        onChange={(e) =>
                          onPatch({
                            shortlistCount: Math.max(1, Number(e.target.value)),
                          })
                        }
                      />
                    </span>
                  </span>
                )}
                <Switch
                  aria-label="Shortlist automatically"
                  checked={r.shortlistCount > 0}
                  onChange={(e) =>
                    onPatch({
                      shortlistCount: e.target.checked
                        ? Math.max(1, r.shortlistCount || 10)
                        : 0,
                    })
                  }
                />
              </div>
            </div>
          ) : (
            <p className="text-small text-text-secondary">
              You&apos;ll choose who moves on by hand from the Rounds view. Turn
              on scoring above to rank and shortlist automatically.
            </p>
          )}
        </Group>
      </div>
    </div>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 px-5 py-4">
      <div>
        <h4 className="text-text-primary text-sm font-bold">{title}</h4>
        {hint && <p className="text-text-secondary text-xs">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ModeCard({
  icon,
  title,
  hint,
  active,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
        active
          ? "border-primary ring-2 ring-[color-mix(in_srgb,var(--color-primary)_12%,transparent)]"
          : "border-border-light hover:border-border-hover"
      }`}
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-md ${active ? "bg-primary text-white" : "bg-bg-light text-text-secondary"}`}
      >
        <Icon icon={icon} size="sm" className="size-4" />
      </span>
      <span>
        <span className="text-small text-text-primary block font-semibold">
          {title}
        </span>
        <span className="text-text-secondary block text-xs">{hint}</span>
      </span>
    </button>
  );
}

function ToggleCard({
  icon,
  title,
  hint,
  checked,
  onChange,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
        checked
          ? "border-primary bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)]"
          : "border-border-light hover:border-border-hover"
      }`}
    >
      <span className="bg-bg-light text-text-secondary flex size-8 shrink-0 items-center justify-center rounded-md">
        <Icon icon={icon} size="sm" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-small text-text-primary block font-semibold">
          {title}
        </span>
        <span className="text-text-secondary block text-xs">{hint}</span>
      </span>
      <Switch
        aria-label={title}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
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
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`text-text-secondary hover:bg-bg-light rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${danger ? "hover:text-danger" : "hover:text-text-primary"}`}
    >
      <Icon icon={icon} size="sm" className="size-4" />
    </button>
  );
}
