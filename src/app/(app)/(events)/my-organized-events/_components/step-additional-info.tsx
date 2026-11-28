"use client";

import { useState } from "react";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleAlert,
  CircleDot,
  Copy,
  Lock,
  Mic,
  Plus,
  SquareCheck,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button, Checkbox, Icon, Input, Switch } from "@/components/atoms";
import {
  EventDetailData,
  EventQuestionData,
  UpdateEventDetailData,
} from "@/lib/zod/event";

export type FormAudience = "ATTENDEE" | "PARTICIPANT";
type QType = EventQuestionData["type"];
type QOption = EventQuestionData["options"][number];

const TYPES: { value: QType; label: string; icon: LucideIcon }[] = [
  { value: "TEXT", label: "Short answer", icon: AlignLeft },
  { value: "RADIO", label: "One choice", icon: CircleDot },
  { value: "CHECKBOX", label: "Several choices", icon: SquareCheck },
];
const typeOf = (t: QType) => TYPES.find((x) => x.value === t) ?? TYPES[0];

// One-tap questions organizers ask most, per pass. Generic on purpose: the
// page serves every event type. Hidden once added.
const STARTERS: Record<
  FormAudience,
  { prompt: string; type: QType; options?: string[]; required?: boolean }[]
> = {
  ATTENDEE: [
    {
      prompt: "How did you hear about this event?",
      type: "RADIO",
      options: ["Instagram", "WhatsApp", "A friend", "Other"],
    },
    { prompt: "College or company", type: "TEXT" },
    {
      prompt: "Food preference",
      type: "RADIO",
      options: ["Veg", "Non-veg", "Vegan", "Jain"],
    },
    { prompt: "T-shirt size", type: "RADIO", options: ["S", "M", "L", "XL"] },
    { prompt: "Any accessibility needs we should plan for?", type: "TEXT" },
  ],
  PARTICIPANT: [
    { prompt: "Name or team name", type: "TEXT", required: true },
    { prompt: "What will you be doing at the event?", type: "TEXT" },
    {
      prompt: "Group size",
      type: "RADIO",
      options: ["Solo", "Duo", "3–5 people"],
    },
    { prompt: "Instagram handle", type: "TEXT" },
    {
      prompt: "Done this before?",
      type: "RADIO",
      options: ["First time", "A few times", "Regularly"],
    },
  ],
};

const isOtherChoice = (label: string) =>
  /^(other|others|other \(please specify\))$/i.test(label.trim());

function emptyOption(label = ""): QOption {
  return {
    id: null,
    settingId: null,
    label,
    advancedEnabled: false,
    advancedRequired: false,
    advancedOptions: [],
  };
}

// Copy of an option tree with every id cleared, so a duplicated question
// saves as new rows instead of pointing at the original's.
function cloneOption(o: QOption): QOption {
  return {
    ...o,
    id: null,
    settingId: null,
    advancedOptions: o.advancedOptions.map(cloneOption),
  };
}

function updateTreeOption(
  options: QOption[],
  path: number[],
  patch: Partial<QOption>,
): QOption[] {
  if (!path.length) return options;
  const [index, ...rest] = path;
  return options.map((option, i) =>
    i !== index
      ? option
      : rest.length
        ? {
            ...option,
            advancedOptions: updateTreeOption(
              option.advancedOptions,
              rest,
              patch,
            ),
          }
        : { ...option, ...patch },
  );
}

// A follow-up with no choices of its own can't be answered.
function followupBroken(options: QOption[]): boolean {
  return options.some(
    (o) =>
      !isOtherChoice(o.label) &&
      o.advancedEnabled &&
      (o.advancedOptions.filter((c) => c.label.trim()).length === 0 ||
        followupBroken(o.advancedOptions)),
  );
}

/** Plain-language issues that would leave a broken question on the form. */
export function questionProblems(q: EventQuestionData): string[] {
  const out: string[] = [];
  if (!q.prompt.trim()) out.push("Write the question");
  if (q.type !== "TEXT" && q.options.filter((o) => o.label.trim()).length < 2)
    out.push("Add at least 2 choices");
  if (q.type === "CHECKBOX" && followupBroken(q.options))
    out.push("A follow-up needs at least one choice");
  return out;
}

const passName = (data: EventDetailData, a: FormAudience) =>
  a === "ATTENDEE"
    ? data.attendeeLabel.trim() || "Audience"
    : data.participantLabel.trim() || "Participant";

export interface StepAdditionalInfoProps {
  data: EventDetailData;
  onChange: UpdateEventDetailData;
  /** Lifted so the editor's preview shows the same pass. */
  audience?: FormAudience;
  onAudienceChange?: (a: FormAudience) => void;
}

export function StepAdditionalInfo({
  data,
  onChange,
  audience: audienceProp,
  onAudienceChange,
}: StepAdditionalInfoProps) {
  const [own, setOwn] = useState<FormAudience>("ATTENDEE");
  const audience = audienceProp ?? own;
  const setAudience = onAudienceChange ?? setOwn;
  const [open, setOpen] = useState<number | null>(null);

  const indexed = data.questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.appliesTo === audience);
  const audioHere =
    data.audioRecordingEnabled && data.audioRecordingAppliesTo === audience;
  const audioElsewhere =
    data.audioRecordingEnabled && data.audioRecordingAppliesTo !== audience;
  const passOff =
    audience === "PARTICIPANT"
      ? !data.participantRegistrationEnabled
      : !data.attendeeRegistrationEnabled;

  const count = (a: FormAudience) =>
    data.questions.filter((q) => q.appliesTo === a).length +
    (data.audioRecordingEnabled && data.audioRecordingAppliesTo === a ? 1 : 0);

  function setQuestions(next: EventQuestionData[]) {
    onChange("questions", next);
  }
  function patch(index: number, p: Partial<EventQuestionData>) {
    setQuestions(
      data.questions.map((q, i) => (i === index ? { ...q, ...p } : q)),
    );
  }
  function add(q?: Partial<EventQuestionData>) {
    const next: EventQuestionData = {
      id: null,
      prompt: "",
      type: "TEXT",
      required: false,
      allowOther: false,
      appliesTo: audience,
      options: [],
      ...q,
    };
    setQuestions([...data.questions, next]);
    setOpen(data.questions.length);
  }
  function remove(index: number) {
    setQuestions(data.questions.filter((_, i) => i !== index));
    setOpen(null);
  }
  function duplicate(index: number) {
    const src = data.questions[index];
    const copy: EventQuestionData = {
      ...src,
      id: null,
      prompt: src.prompt ? `${src.prompt} (copy)` : "",
      options: src.options.map(cloneOption),
    };
    const next = [...data.questions];
    next.splice(index + 1, 0, copy);
    setQuestions(next);
    setOpen(index + 1);
  }
  // Moves within this pass's questions only — swaps with the neighbouring
  // question of the same pass, wherever it sits in the shared array.
  function move(pos: number, dir: -1 | 1) {
    const a = indexed[pos]?.i;
    const b = indexed[pos + dir]?.i;
    if (a == null || b == null) return;
    const next = [...data.questions];
    [next[a], next[b]] = [next[b], next[a]];
    setQuestions(next);
    if (open === a) setOpen(b);
  }

  const taken = new Set(indexed.map(({ q }) => q.prompt.trim().toLowerCase()));
  const starters = STARTERS[audience].filter(
    (s) => !taken.has(s.prompt.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* which pass's form */}
      <div className="space-y-2">
        <p className="text-small text-text-secondary">
          After booking, each person gets a short form for their pass. Build one
          for each.
        </p>
        <div
          role="tablist"
          aria-label="Form for"
          className="bg-bg-light grid grid-cols-2 gap-1 rounded-lg p-1"
        >
          {(["ATTENDEE", "PARTICIPANT"] as const).map((a) => {
            const active = a === audience;
            const n = count(a);
            return (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setAudience(a);
                  setOpen(null);
                }}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-surface-light text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {passName(data, a)} pass
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-primary text-white" : "bg-surface-light"}`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        {passOff && (
          <p className="text-small text-text-secondary flex items-center gap-2">
            <Icon icon={CircleAlert} size="sm" className="size-4 shrink-0" />
            The {passName(data, audience)} pass is off, so nobody sees this form
            until you turn it on in Passes.
          </p>
        )}
      </div>

      {/* follow-ups + Other (both passes) */}
      <div className="border-border-light flex items-start gap-3 rounded-md border p-3">
        <span className="min-w-0 flex-1">
          <span className="text-small text-text-primary block font-semibold">
            Follow-up questions
          </span>
          <span className="text-text-secondary block text-xs">
            Lets &ldquo;Several choices&rdquo; questions open further choices
            under an answer, and adds an optional &ldquo;Other (please
            specify)&rdquo; field. Simple questions keep working as they are
            when this is off.
          </span>
        </span>
        <Switch
          aria-label="Follow-up questions"
          checked={data.advancedAdditionalQuestionsEnabled}
          onChange={(e) =>
            onChange("advancedAdditionalQuestionsEnabled", e.target.checked)
          }
        />
      </div>

      {/* already collected — the booking form requires all three */}
      <section className="space-y-2">
        <h3 className="text-text-primary text-sm font-bold">Always asked</h3>
        <div className="border-border-light divide-border-light divide-y rounded-md border">
          {["Full name", "Email", "Phone number"].map((f) => (
            <div
              key={f}
              className="text-small text-text-secondary flex items-center gap-3 px-3 py-2"
            >
              <Icon icon={Lock} size="sm" className="size-3.5 shrink-0" />
              <span className="text-text-primary">{f}</span>
              <span className="ml-auto text-xs">collected at booking</span>
            </div>
          ))}
        </div>
      </section>

      {/* audio clip */}
      <section className="space-y-2">
        <h3 className="text-text-primary text-sm font-bold">Audio clip</h3>
        <div
          className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
            audioHere
              ? "border-primary bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)]"
              : "border-border-light"
          }`}
        >
          <span className="bg-bg-light text-text-secondary flex size-8 shrink-0 items-center justify-center rounded-md">
            <Icon icon={Mic} size="sm" className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-small text-text-primary block font-semibold">
              Ask for an audio clip
            </span>
            <span className="text-text-secondary block text-xs">
              {audioElsewhere
                ? `Asked of the ${passName(data, data.audioRecordingAppliesTo)} pass right now. Turning it on here moves it — only one pass can be asked.`
                : "They record in the browser, upload a file or paste a link before the deadline."}
            </span>
          </span>
          <Switch
            aria-label="Ask for an audio clip"
            checked={audioHere}
            onChange={(e) => {
              if (e.target.checked) {
                onChange("audioRecordingAppliesTo", audience);
                onChange("audioRecordingEnabled", true);
              } else {
                onChange("audioRecordingEnabled", false);
              }
            }}
          />
        </div>
      </section>

      {/* questions */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-text-primary text-sm font-bold">
            Your questions
          </h3>
          {indexed.length > 0 && (
            <span className="text-text-secondary text-xs">
              {indexed.filter(({ q }) => q.required).length} of {indexed.length}{" "}
              required
            </span>
          )}
        </div>

        {indexed.length === 0 && (
          <p className="border-border-light text-small text-text-secondary rounded-md border border-dashed px-4 py-5 text-center">
            No extra questions. {passName(data, audience)} pass holders go
            straight to their ticket.
          </p>
        )}

        <ol className="space-y-2">
          {indexed.map(({ q, i }, pos) => (
            <QuestionCard
              key={i}
              n={pos + 1}
              q={q}
              advanced={data.advancedAdditionalQuestionsEnabled}
              open={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
              onPatch={(p) => patch(i, p)}
              onRemove={() => remove(i)}
              onDuplicate={() => duplicate(i)}
              onUp={pos > 0 ? () => move(pos, -1) : undefined}
              onDown={pos < indexed.length - 1 ? () => move(pos, 1) : undefined}
            />
          ))}
        </ol>

        <button
          type="button"
          onClick={() => add()}
          className="border-border-light text-text-secondary hover:border-border-hover hover:text-text-primary flex w-full items-center justify-center gap-2 rounded-md border border-dashed py-2.5 text-sm font-semibold transition-colors"
        >
          <Icon icon={Plus} size="sm" className="size-4" /> Add question
        </button>

        {starters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-text-secondary text-xs">Quick add:</span>
            {starters.map((s) => (
              <button
                key={s.prompt}
                type="button"
                onClick={() =>
                  add({
                    prompt: s.prompt,
                    type: s.type,
                    required: !!s.required,
                    options: (s.options ?? []).map((label) =>
                      emptyOption(label),
                    ),
                  })
                }
                className="border-border-light text-text-primary hover:border-border-hover rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
              >
                + {s.prompt}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// Nested follow-up choices under a CHECKBOX answer (any depth).
function FollowupOptionEditor({
  options,
  path,
  onChange,
}: {
  options: QOption[];
  path: number[];
  onChange: (path: number[], patch: Partial<QOption>) => void;
}) {
  return (
    <div className="ml-4 space-y-2 border-l-2 pl-3">
      {options.map((option, index) => {
        const optionPath = [...path, index];
        return (
          <div key={option.id ?? optionPath.join("-")} className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                size="sm"
                placeholder={`Follow-up choice ${index + 1}`}
                value={option.label}
                onChange={(e) =>
                  onChange(optionPath, { label: e.target.value })
                }
                className="flex-1"
              />
              <button
                type="button"
                aria-label="Remove follow-up choice"
                onClick={() =>
                  onChange(path, {
                    advancedOptions: options.filter((_, i) => i !== index),
                  })
                }
                className="text-text-secondary hover:text-danger rounded-md p-1"
              >
                <Icon icon={X} size="sm" className="size-4" />
              </button>
              <Checkbox
                label="Ask a follow-up"
                checked={option.advancedEnabled}
                onChange={(e) =>
                  onChange(optionPath, { advancedEnabled: e.target.checked })
                }
              />
            </div>
            {option.advancedEnabled && (
              <>
                <Checkbox
                  label="Require at least one follow-up choice"
                  checked={option.advancedRequired}
                  onChange={(e) =>
                    onChange(optionPath, {
                      advancedRequired: e.target.checked,
                    })
                  }
                />
                {option.advancedOptions.filter((child) => child.label.trim())
                  .length === 0 && (
                  <p className="text-small text-danger">
                    Add at least one choice for this follow-up.
                  </p>
                )}
                <FollowupOptionEditor
                  options={option.advancedOptions}
                  path={optionPath}
                  onChange={onChange}
                />
              </>
            )}
          </div>
        );
      })}
      <Button
        variant="secondary"
        size="xs"
        onClick={() =>
          onChange(path, { advancedOptions: [...options, emptyOption()] })
        }
      >
        + Add follow-up choice
      </Button>
    </div>
  );
}

function QuestionCard({
  n,
  q,
  advanced,
  open,
  onToggle,
  onPatch,
  onRemove,
  onDuplicate,
  onUp,
  onDown,
}: {
  n: number;
  q: EventQuestionData;
  /** "Follow-up questions" switch — gates Other and follow-ups. */
  advanced: boolean;
  open: boolean;
  onToggle: () => void;
  onPatch: (p: Partial<EventQuestionData>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const t = typeOf(q.type);
  const problems = questionProblems(q);
  const choices = q.options.filter((o) => o.label.trim()).length;

  function setType(type: QType) {
    // Switching to a choice type seeds two blank choices to fill in.
    const options =
      type !== "TEXT" && q.options.length === 0
        ? [emptyOption(), emptyOption()]
        : q.options;
    onPatch({ type, options });
  }
  function patchOption(idx: number, p: Partial<QOption>) {
    onPatch({
      options: q.options.map((o, i) => (i === idx ? { ...o, ...p } : o)),
    });
  }
  function addOption() {
    onPatch({ options: [...q.options, emptyOption()] });
  }
  function removeOption(idx: number) {
    onPatch({ options: q.options.filter((_, i) => i !== idx) });
  }
  function toggleOther(on: boolean) {
    const options = [...q.options];
    if (on && !options.some((o) => isOtherChoice(o.label)))
      options.push(emptyOption("Other (please specify)"));
    onPatch({
      allowOther: on,
      options: on ? options : options.filter((o) => !isOtherChoice(o.label)),
    });
  }

  return (
    <li
      className={`bg-surface-light rounded-md border transition-colors ${
        open
          ? "border-primary ring-2 ring-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
          : "border-border-light hover:border-border-hover"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="text-text-secondary w-5 shrink-0 text-xs font-bold tabular-nums">
          {String(n).padStart(2, "0")}
        </span>
        <Icon
          icon={t.icon}
          size="sm"
          className="text-text-secondary size-4 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm font-semibold ${q.prompt.trim() ? "text-text-primary" : "text-text-secondary italic"}`}
          >
            {q.prompt.trim() || "Untitled question"}
          </span>
          <span className="text-text-secondary block text-xs">
            {t.label}
            {q.type !== "TEXT" &&
              ` · ${choices} choice${choices === 1 ? "" : "s"}`}
            {q.required && " · Required"}
          </span>
        </span>
        {problems.length > 0 && (
          <Icon
            icon={CircleAlert}
            size="sm"
            className="text-warning size-4 shrink-0"
            label="Needs attention"
          />
        )}
        <Icon
          icon={ChevronDown}
          size="sm"
          className={`text-text-secondary size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-border-light space-y-4 border-t px-3 pt-3 pb-3">
          <Input
            autoFocus={!q.prompt}
            placeholder="Type your question"
            aria-label="Question"
            value={q.prompt}
            onChange={(e) => onPatch({ prompt: e.target.value })}
          />

          <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
            {TYPES.map((x) => {
              const active = x.value === q.type;
              return (
                <button
                  key={x.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setType(x.value)}
                  className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold transition-colors ${
                    active
                      ? "border-primary text-text-primary bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]"
                      : "border-border-light text-text-secondary hover:border-border-hover"
                  }`}
                >
                  <Icon icon={x.icon} size="sm" className="size-4" />
                  {x.label}
                </button>
              );
            })}
          </div>

          {q.type === "TEXT" ? (
            <div className="border-border-light text-text-secondary rounded-md border border-dashed px-3 py-2 text-xs">
              They type a short answer here
            </div>
          ) : (
            <div className="space-y-1.5">
              {q.options.map((o, idx) => {
                const followable =
                  advanced && q.type === "CHECKBOX" && !isOtherChoice(o.label);
                return (
                  <div key={o.id ?? idx} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`border-border-hover size-4 shrink-0 border-2 ${q.type === "RADIO" ? "rounded-full" : "rounded-sm"}`}
                      />
                      <Input
                        size="sm"
                        placeholder={`Choice ${idx + 1}`}
                        aria-label={`Choice ${idx + 1}`}
                        value={o.label}
                        onChange={(e) =>
                          patchOption(idx, { label: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addOption();
                          }
                        }}
                        className="flex-1"
                      />
                      {followable && (
                        <Checkbox
                          label="Ask a follow-up"
                          checked={o.advancedEnabled}
                          onChange={(e) =>
                            patchOption(idx, {
                              advancedEnabled: e.target.checked,
                            })
                          }
                        />
                      )}
                      <button
                        type="button"
                        aria-label={`Remove choice ${idx + 1}`}
                        onClick={() => removeOption(idx)}
                        className="text-text-secondary hover:text-danger rounded-md p-1"
                      >
                        <Icon icon={X} size="sm" className="size-4" />
                      </button>
                    </div>
                    {followable && o.advancedEnabled && (
                      <div className="space-y-2 pl-6">
                        <Checkbox
                          label="Require at least one follow-up choice"
                          checked={o.advancedRequired}
                          onChange={(e) =>
                            patchOption(idx, {
                              advancedRequired: e.target.checked,
                            })
                          }
                        />
                        {o.advancedOptions.filter((c) => c.label.trim())
                          .length === 0 && (
                          <p className="text-small text-danger">
                            Add at least one choice for this follow-up.
                          </p>
                        )}
                        <FollowupOptionEditor
                          options={o.advancedOptions}
                          path={[idx]}
                          onChange={(path, p) =>
                            onPatch({
                              options: updateTreeOption(q.options, path, p),
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addOption}
                className="text-text-secondary hover:text-text-primary flex items-center gap-2 py-1 pl-6 text-xs font-semibold"
              >
                <Icon icon={Plus} size="sm" className="size-3.5" /> Add choice
                <span className="font-normal">· or press Enter</span>
              </button>
              {advanced && q.type === "CHECKBOX" && (
                <div className="pl-6">
                  <Checkbox
                    label="Add Other (please specify)"
                    checked={q.allowOther}
                    onChange={(e) => toggleOther(e.target.checked)}
                  />
                </div>
              )}
            </div>
          )}

          {problems.length > 0 && (
            <p className="text-warning flex items-center gap-1.5 text-xs font-medium">
              <Icon icon={CircleAlert} size="sm" className="size-3.5" />
              {problems.join(" · ")}
            </p>
          )}

          <div className="border-border-light flex flex-wrap items-center gap-2 border-t pt-3">
            <Switch
              label="Required"
              checked={q.required}
              onChange={(e) => onPatch({ required: e.target.checked })}
            />
            <span className="ml-auto flex items-center gap-0.5">
              <IconBtn icon={ArrowUp} label="Move up" onClick={onUp} />
              <IconBtn icon={ArrowDown} label="Move down" onClick={onDown} />
              <IconBtn icon={Copy} label="Duplicate" onClick={onDuplicate} />
              <IconBtn
                icon={Trash2}
                label="Remove question"
                onClick={onRemove}
                danger
              />
            </span>
          </div>
        </div>
      )}
    </li>
  );
}

function IconBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!onClick}
      onClick={onClick}
      className={`text-text-secondary hover:bg-bg-light rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${danger ? "hover:text-danger" : "hover:text-text-primary"}`}
    >
      <Icon icon={icon} size="sm" className="size-4" />
    </button>
  );
}

// What a pass holder sees on /:id/additional-info, built from the
// draft — for the editor's preview panel.
export function RegistrationFormPreview({
  data,
  audience,
}: {
  data: EventDetailData;
  audience: FormAudience;
}) {
  const qs = data.questions.filter(
    (q) => q.appliesTo === audience && q.prompt.trim(),
  );
  const audio =
    data.audioRecordingEnabled && data.audioRecordingAppliesTo === audience;
  const title = data.title.trim() || "Your event";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-text-secondary text-xs font-bold tracking-widest uppercase">
          {passName(data, audience)} pass · {title}
        </p>
        <h3 className="text-text-primary mt-1 text-xl font-extrabold">
          A few more details
        </h3>
        <p className="text-small text-text-secondary">
          You&apos;re booked. Answer these so the organizer can plan.
        </p>
      </div>

      {!audio && qs.length === 0 && (
        <div className="border-border-light text-small text-text-secondary rounded-lg border border-dashed px-4 py-8 text-center">
          Nothing extra to ask — this step is skipped and they go straight to
          their ticket.
        </div>
      )}

      {audio && (
        <div className="border-border-light space-y-3 rounded-lg border p-4">
          <p className="text-text-primary text-sm font-semibold">
            Audio clip <span className="text-danger">*</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <span className="border-border-light text-text-primary flex items-center justify-center gap-2 rounded-md border py-2 text-xs font-semibold">
              <Icon icon={Mic} size="sm" className="size-4" /> Record
            </span>
            <span className="border-border-light text-text-primary flex items-center justify-center gap-2 rounded-md border py-2 text-xs font-semibold">
              <Icon icon={Upload} size="sm" className="size-4" /> Upload or link
            </span>
          </div>
        </div>
      )}

      {qs.map((q, i) => (
        <fieldset key={i} className="space-y-2">
          <legend className="text-text-primary text-sm font-semibold">
            {q.prompt}
            {q.required && <span className="text-danger"> *</span>}
          </legend>
          {q.type === "TEXT" ? (
            <div className="border-border-light bg-surface-light h-9 rounded-md border" />
          ) : (
            <div className="space-y-1.5">
              {q.options
                .filter((o) => o.label.trim())
                .map((o, j) => (
                  <label
                    key={j}
                    className="border-border-light text-small text-text-primary flex items-center gap-2.5 rounded-md border px-3 py-2"
                  >
                    <input
                      type={q.type === "RADIO" ? "radio" : "checkbox"}
                      name={`pv-${i}`}
                      className="accent-primary"
                    />
                    {o.label}
                  </label>
                ))}
            </div>
          )}
        </fieldset>
      ))}

      {(audio || qs.length > 0) && (
        <span className="bg-primary flex h-10 items-center justify-center rounded-md text-sm font-semibold text-white">
          Confirm details
        </span>
      )}
    </div>
  );
}
