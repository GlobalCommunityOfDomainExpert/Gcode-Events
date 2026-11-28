"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Compass,
  ExternalLink,
  FileAudio,
  Link2,
  LucideIcon,
  Mic,
  Upload,
} from "lucide-react";
import { Button, Checkbox, Icon, Input } from "@/components/atoms";
import {
  AudioRecorder,
  Breadcrumb,
  FormField,
  FormPageSkeleton,
  NotFoundState,
} from "@/components/molecules";
import { useEvent } from "@/hooks/use-event";
import {
  getParticipant,
  getParticipantAnswers,
  saveParticipantAnswers,
  submitParticipantAudio,
  type SaveAnswersBody,
  uploadParticipantAudio,
} from "@/lib/api/participants";
import { ApiError } from "@/lib/api/client";
import type { ParticipantSummary } from "@/lib/api/participants";
import { EventQuestion } from "@/lib/event";
import { getEventColor } from "@/lib/event-color";

const SUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000;

type SubmissionMode = "record" | "upload" | "link";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const isOtherChoice = (label: string) =>
  /^(other|others|other \(please specify\))$/i.test(label.trim());

function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 48) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${minutes}m`;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const stripTone = {
  danger: {
    wrap: "border-danger/30 bg-danger-light",
    icon: "bg-danger text-white",
  },
  success: {
    wrap: "border-success/30 bg-success-light",
    icon: "bg-success text-white",
  },
  warning: {
    wrap: "border-warning/40 bg-warning-light",
    icon: "bg-warning text-white",
  },
} as const;

// One strip that answers "how long do I have?" — countdown while open, a
// lock-in note once submitted, the disqualification once it's gone.
function DeadlineStrip({
  tone,
  icon,
  title,
  text,
  aside,
}: {
  tone: keyof typeof stripTone;
  icon: LucideIcon;
  title: string;
  text: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-lg border p-4 ${stripTone[tone].wrap}`}
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-full ${stripTone[tone].icon}`}
      >
        <Icon icon={icon} size="sm" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-text-primary font-semibold">{title}</p>
        <p className="text-small text-text-secondary">{text}</p>
      </div>
      {aside}
    </div>
  );
}

function TimeLeft({ ms }: { ms: number }) {
  return (
    <span className="text-text-primary shrink-0 text-right">
      <span className="block text-lg font-extrabold tabular-nums">
        {formatCountdown(ms)}
      </span>
      <span className="text-text-secondary text-xs">left</span>
    </span>
  );
}

const STEPS = ["Registered", "Your entry", "Ticket"];

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Registration progress">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            className="flex flex-1 items-center gap-2 last:flex-none"
          >
            <span
              aria-current={active ? "step" : undefined}
              className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                done
                  ? "bg-success text-white"
                  : active
                    ? "bg-primary ring-primary/20 text-white ring-4"
                    : "border-border-hover text-text-secondary border-2"
              }`}
            >
              {done ? (
                <Icon icon={Check} size="sm" className="size-3.5" />
              ) : (
                i + 1
              )}
            </span>
            <span
              className={`text-small whitespace-nowrap ${active ? "text-text-primary font-semibold" : "text-text-secondary"}`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={`h-0.5 flex-1 rounded-full ${done ? "bg-success" : "bg-border-light"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

const MODE_TILES: {
  value: SubmissionMode;
  icon: LucideIcon;
  label: string;
  hint: string;
}[] = [
  {
    value: "record",
    icon: Mic,
    label: "Record",
    hint: "Up to 6 min, right here",
  },
  {
    value: "upload",
    icon: Upload,
    label: "Upload",
    hint: "MP3, WAV, M4A · 20MB",
  },
  {
    value: "link",
    icon: Link2,
    label: "Paste a link",
    hint: "Drive or YouTube",
  },
];

export default function AdditionalInfoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const participantId = searchParams.get("pid");
  const { event } = useEvent(params.id);

  const [participant, setParticipant] = useState<
    ParticipantSummary | undefined
  >();
  const [participantStatus, setParticipantStatus] = useState<
    "loading" | "error" | "ready"
  >(participantId ? "loading" : "error");

  const [mode, setMode] = useState<SubmissionMode>("record");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [submittedUrl, setSubmittedUrl] = useState<string | null>(null);
  // Custom-question answers. TEXT -> textAnswers[questionId]. RADIO/CHECKBOX
  // -> optionAnswers[questionId] (a single-element set for RADIO). Keyed by
  // question id (string) rather than nested under one big object so a
  // single question's edit doesn't need to rebuild the whole structure.
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [optionAnswers, setOptionAnswers] = useState<
    Record<string, Set<string>>
  >({});
  const [followupAnswers, setFollowupAnswers] = useState<
    Record<string, Set<string>>
  >({});
  const [otherAnswers, setOtherAnswers] = useState<Record<string, string>>({});
  const [attemptedConfirm, setAttemptedConfirm] = useState(false);
  // Re-renders every 30s so the countdown/disqualification state stays live
  // without the participant having to refresh the page.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!participantId) return;
    let cancelled = false;
    void (async () => {
      try {
        const row = await getParticipant(participantId);
        if (cancelled) return;
        if (!row) {
          setParticipantStatus("error");
          return;
        }
        setParticipant(row);
        setSubmittedUrl(row.audioSubmissionUrl ?? null);
        setParticipantStatus("ready");

        const saved = await getParticipantAnswers(row.id);
        if (cancelled) return;
        // A TEXT question only ever produces an answerText row; a
        // RADIO/CHECKBOX question only ever produces optionId rows — so
        // this splits cleanly without needing to know each question's type.
        const initialText: Record<string, string> = {};
        const initialOptions: Record<string, Set<string>> = {};
        for (const answer of saved.answers) {
          const questionId = String(answer.questionId);
          if (answer.optionId !== null) {
            const set = initialOptions[questionId] ?? new Set<string>();
            set.add(String(answer.optionId));
            initialOptions[questionId] = set;
          } else if (answer.answerText !== null) {
            initialText[questionId] = answer.answerText;
          }
        }
        setTextAnswers(initialText);
        setOptionAnswers(initialOptions);
        const initialFollowups: Record<string, Set<string>> = {};
        const initialOthers: Record<string, string> = {};
        for (const answer of saved.advancedAnswers) {
          if (answer.isOther)
            initialOthers[String(answer.questionId)] = answer.answerText ?? "";
          else if (
            answer.sourceOptionId !== null &&
            answer.advancedOptionId !== null
          ) {
            const key = String(answer.settingId);
            const selected = initialFollowups[key] ?? new Set<string>();
            selected.add(String(answer.advancedOptionId));
            initialFollowups[key] = selected;
          }
        }
        setFollowupAnswers(initialFollowups);
        setOtherAnswers(initialOthers);
      } catch {
        if (!cancelled) setParticipantStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [participantId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!event || participantStatus === "loading") {
    return <FormPageSkeleton label="Loading your registration…" />;
  }

  if (participantStatus === "error" || !participant) {
    return (
      <NotFoundState
        icon={Compass}
        title="Registration not found"
        description="We couldn't find this registration. Check the link from your confirmation email."
        actionHref={`/${event.id}`}
        actionLabel="Back to Event"
      />
    );
  }

  const category = participant.category ?? "ATTENDEE";
  // Audio and every custom question pick their own audience individually —
  // no page-wide switch. A category with nothing applicable to it still
  // loads the page, just showing the "nothing needed" card below.
  const audioAppliesToMe =
    event.audioRecordingEnabled && event.audioRecordingAppliesTo === category;
  const applicableQuestions = event.questions.filter(
    (q) => q.appliesTo === category,
  );

  // Window closes 24h after this registration's own category deadline
  // (Participant or Attendee), not 24h after this participant applied —
  // falls back to appliedOn if the organizer hasn't set one.
  const registrationClosesAt =
    (category === "PARTICIPANT"
      ? event.participantRegistration.registrationDeadlineIso
      : event.attendeeRegistration.registrationDeadlineIso) ??
    participant.appliedOn ??
    now.toISOString();
  const deadline = new Date(
    new Date(registrationClosesAt).getTime() + SUBMISSION_WINDOW_MS,
  );
  const msRemaining = deadline.getTime() - now.getTime();
  // Window is a hard cutoff — replacing an existing submission is blocked
  // too, matching submit_audio's server-side check (no exemption for rows
  // that already have an audio_submission_url).
  const isPastDeadline = msRemaining <= 0;
  const isDisqualified = isPastDeadline && !submittedUrl;
  const audioRequired = audioAppliesToMe && !isPastDeadline && !submittedUrl;
  const questionErrors = attemptedConfirm ? requiredQuestionErrors() : {};

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // iOS often reports an empty or non-"audio/" MIME type for Voice Memos
    // exports (.m4a/.caf) picked via the share sheet — fall back to the file
    // extension instead of hard-rejecting a file the browser mislabeled.
    const looksLikeAudio =
      file.type.startsWith("audio/") ||
      /\.(mp3|wav|m4a|mp4|aac|ogg|oga|webm|flac|caf|amr|3gp|3gpp)$/i.test(
        file.name,
      );
    if (!looksLikeAudio) {
      setError("Please choose an audio file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("File too large — max 20MB.");
      return;
    }
    setError("");
    setAudioBlob(file);
  }

  function setTextAnswer(questionId: string, value: string) {
    setTextAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function selectRadioOption(questionId: string, optionId: string) {
    setOptionAnswers((prev) => ({
      ...prev,
      [questionId]: new Set([optionId]),
    }));
  }

  function toggleCheckboxOption(questionId: string, optionId: string) {
    setOptionAnswers((prev) => {
      const next = new Set(prev[questionId] ?? []);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return { ...prev, [questionId]: next };
    });
  }

  function requiredQuestionErrors() {
    const errors: Record<string, string> = {};
    for (const question of applicableQuestions) {
      if (question.required) {
        const answered =
          question.type === "TEXT"
            ? !!textAnswers[question.id]?.trim()
            : !!optionAnswers[question.id]?.size;
        if (!answered) errors[question.id] = "This field is required.";
      }
      const otherOption = question.options.find((o) => isOtherChoice(o.label));
      if (
        question.allowOther &&
        otherOption &&
        optionAnswers[question.id]?.has(otherOption.id) &&
        !otherAnswers[question.id]?.trim()
      ) {
        errors[`${question.id}-other`] = "Please specify your answer.";
      }
      if (question.type === "CHECKBOX")
        for (const option of question.options) {
          if (optionAnswers[question.id]?.has(option.id))
            validateFollowup(option, errors);
        }
    }
    return errors;
  }

  function validateFollowup(
    parent: EventQuestion["options"][number],
    errors: Record<string, string>,
  ) {
    if (!parent.advancedEnabled || !parent.settingId) return;
    const key = String(parent.settingId);
    const selected = followupAnswers[key] ?? new Set<string>();
    if (parent.advancedRequired && selected.size === 0)
      errors[key] = "Select at least one follow-up choice.";
    for (const child of parent.advancedOptions)
      if (selected.has(child.id)) validateFollowup(child, errors);
  }

  function renderFollowup(parent: EventQuestion["options"][number]): ReactNode {
    if (
      !parent.advancedEnabled ||
      !parent.settingId ||
      parent.advancedOptions.length === 0
    )
      return null;
    const key = String(parent.settingId);
    return (
      <div className="border-border-light mt-3 ml-1 space-y-2 border-l-2 pl-4">
        <p className="text-small text-text-secondary">
          {parent.label} — select applicable options
          {parent.advancedRequired ? " (required)" : ""}
        </p>
        {parent.advancedOptions.map((choice) => (
          <div key={choice.id} className="space-y-2">
            <Checkbox
              label={choice.label}
              checked={followupAnswers[key]?.has(choice.id) ?? false}
              onChange={() =>
                setFollowupAnswers((prev) => {
                  const next = new Set(prev[key] ?? []);
                  if (next.has(choice.id)) next.delete(choice.id);
                  else next.add(choice.id);
                  return { ...prev, [key]: next };
                })
              }
            />
            {followupAnswers[key]?.has(choice.id) && renderFollowup(choice)}
          </div>
        ))}
        {questionErrors[key] && (
          <p className="text-small text-danger">{questionErrors[key]}</p>
        )}
      </div>
    );
  }

  function handleModeChange(value: SubmissionMode) {
    setMode(value);
    setAudioBlob(null);
    setAudioUrl("");
    setError("");
  }

  async function handleConfirm() {
    setAttemptedConfirm(true);
    const missingQuestionErrors = requiredQuestionErrors();
    const missingAudio =
      audioRequired && (mode === "link" ? !audioUrl.trim() : !audioBlob);
    if (Object.keys(missingQuestionErrors).length || missingAudio) {
      setError("");
      if (missingAudio && mode === "link" && !audioUrl.trim()) {
        setError("Audio submission URL is required.");
      } else if (missingAudio) {
        setError("Record or select an audio submission before confirming.");
      }
      return;
    }
    const hasAudioReplacement =
      audioBlob !== null || (mode === "link" && !!audioUrl.trim());
    if (
      audioAppliesToMe &&
      !isPastDeadline &&
      hasAudioReplacement &&
      mode === "link" &&
      !isValidUrl(audioUrl.trim())
    ) {
      setError("Enter a valid link (e.g. a Google Drive or YouTube URL).");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const items: {
        questionId: number;
        optionId?: number;
        answerText?: string;
      }[] = [];
      for (const question of applicableQuestions) {
        if (question.type === "TEXT") {
          const value = textAnswers[question.id]?.trim();
          if (value)
            items.push({ questionId: Number(question.id), answerText: value });
        } else {
          for (const optionId of optionAnswers[question.id] ?? []) {
            if (optionId === "__other__") continue;
            items.push({
              questionId: Number(question.id),
              optionId: Number(optionId),
            });
          }
        }
      }
      // Base and follow-up answers are saved together (one transaction).
      const toSave: SaveAnswersBody = {};
      if (applicableQuestions.length) toSave.answers = items;
      if (event?.advancedAdditionalQuestionsEnabled) {
        const advancedItems: NonNullable<SaveAnswersBody["advancedAnswers"]> =
          [];
        for (const question of applicableQuestions) {
          const otherOption = question.options.find((o) =>
            isOtherChoice(o.label),
          );
          if (
            question.allowOther &&
            otherOption &&
            optionAnswers[question.id]?.has(otherOption.id)
          ) {
            if (otherOption.settingId)
              advancedItems.push({
                questionId: Number(question.id),
                settingId: otherOption.settingId,
                sourceOptionId: Number(otherOption.id),
                isOther: true,
                answerText: otherAnswers[question.id]?.trim(),
              });
          }
          const collect = (
            parent: EventQuestion["options"][number],
            sourceOptionId: number,
            parentAdvancedOptionId: number | undefined,
          ) => {
            if (!parent.advancedEnabled || !parent.settingId) return;
            for (const advancedOptionId of followupAnswers[
              String(parent.settingId)
            ] ?? []) {
              advancedItems.push({
                questionId: Number(question.id),
                settingId: parent.settingId,
                sourceOptionId,
                parentAdvancedOptionId,
                advancedOptionId: Number(advancedOptionId),
                isOther: false,
              });
              const child = parent.advancedOptions.find(
                (option) => Number(option.id) === Number(advancedOptionId),
              );
              if (child)
                collect(child, sourceOptionId, Number(advancedOptionId));
            }
          };
          for (const option of question.options)
            if (optionAnswers[question.id]?.has(option.id))
              collect(option, Number(option.id), undefined);
        }
        toSave.advancedAnswers = advancedItems;
      }
      if (toSave.answers || toSave.advancedAnswers) {
        await saveParticipantAnswers(participant!.id, toSave);
      }
      if (audioAppliesToMe && !isPastDeadline && hasAudioReplacement) {
        const { audioSubmissionUrl } = audioBlob
          ? await uploadParticipantAudio(participant!.id, audioBlob)
          : await submitParticipantAudio(participant!.id, audioUrl.trim());
        setSubmittedUrl(audioSubmissionUrl);
      }
      router.replace(
        `/${event!.id}/registered?pid=${participant!.id}&info=complete`,
      );
    } catch (err) {
      const message =
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't save your additional information. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const passLabel =
    category === "PARTICIPANT"
      ? event.participantRegistration.label
      : event.attendeeRegistration.label;
  const isAnswered = (q: EventQuestion) =>
    q.type === "TEXT"
      ? !!textAnswers[q.id]?.trim()
      : !!optionAnswers[q.id]?.size;
  const answeredCount = applicableQuestions.filter(isAnswered).length;
  const requiredQs = applicableQuestions.filter((q) => q.required);
  const audioOpen = audioAppliesToMe && !isPastDeadline;
  const hasAudioDraft = mode === "link" ? !!audioUrl.trim() : !!audioBlob;
  const tasksTotal = requiredQs.length + (audioOpen ? 1 : 0);
  const tasksDone =
    requiredQs.filter(isAnswered).length +
    (audioOpen && (submittedUrl || hasAudioDraft) ? 1 : 0);
  const nothingNeeded = !audioAppliesToMe && applicableQuestions.length === 0;
  const deadlineLabel = deadline.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Breadcrumb
        items={[
          { label: "Events", href: "/" },
          { label: event.title, href: `/${event.id}` },
          { label: "Your entry" },
        ]}
      />

      <Stepper current={1} />

      <div>
        <h1 className="text-display text-text-primary leading-tight font-extrabold">
          {nothingNeeded ? "You're all set" : "Complete your entry"}
        </h1>
        <p className="text-body text-text-secondary mt-1">
          {nothingNeeded
            ? "Nothing else is needed for this event — your ticket is ready."
            : "The organizer needs a few details. It takes about two minutes."}
        </p>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:order-2">
          {/* who / what this entry is for */}
          <div className="border-border-light bg-surface-light overflow-hidden rounded-lg border">
            <div
              className="relative aspect-[3/1] w-full"
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
            <div className="space-y-1 p-4">
              <p className="text-text-primary line-clamp-2 font-bold">
                {event.title}
              </p>
              <p className="text-small text-text-secondary">
                {event.date}
                {event.location ? ` · ${event.location}` : ""}
              </p>
              <span className="bg-primary-light text-primary mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold">
                {passLabel} · {participant.fullName}
              </span>
            </div>
          </div>
          {audioAppliesToMe &&
            (isDisqualified ? (
              <DeadlineStrip
                tone="danger"
                icon={AlertTriangle}
                title="Submission window closed"
                text={`It closed on ${deadlineLabel} with no audio submitted, so this entry is disqualified. Contact the organizer if you think this is a mistake.`}
              />
            ) : submittedUrl ? (
              <DeadlineStrip
                tone="success"
                icon={Check}
                title={isPastDeadline ? "Entry locked in" : "Audio received"}
                text={
                  isPastDeadline
                    ? "The window has closed — your submission is locked in, no further changes."
                    : `You can still replace it until ${deadlineLabel}.`
                }
                aside={!isPastDeadline && <TimeLeft ms={msRemaining} />}
              />
            ) : (
              <DeadlineStrip
                tone="warning"
                icon={Clock}
                title="Submit your audio before the deadline"
                text={`Closes ${deadlineLabel} — entries without an audio submission are disqualified.`}
                aside={<TimeLeft ms={msRemaining} />}
              />
            ))}
        </aside>

        <div className="min-w-0 space-y-6 lg:order-1">
          {nothingNeeded && (
            <div className="border-border-light bg-surface-light flex flex-col items-center gap-3 rounded-lg border p-8 text-center">
              <span className="bg-success grid size-12 place-items-center rounded-full text-white">
                <Icon icon={Check} size="md" />
              </span>
              <p className="text-text-primary font-semibold">
                No extra details needed
              </p>
            </div>
          )}

          {/* questions */}
          {applicableQuestions.length > 0 && (
            <section className="border-border-light bg-surface-light rounded-lg border">
              <header className="border-border-light flex items-center justify-between gap-3 border-b px-5 py-4">
                <div>
                  <h2 className="text-text-primary font-bold">About you</h2>
                  <p className="text-small text-text-secondary">
                    {answeredCount} of {applicableQuestions.length} answered
                  </p>
                </div>
              </header>
              <ol className="divide-border-light divide-y">
                {applicableQuestions.map((question, i) => {
                  const err = questionErrors[question.id];
                  const done = isAnswered(question);
                  const errId = err
                    ? `question-${question.id}-error`
                    : undefined;
                  return (
                    <li key={question.id} className="flex gap-4 px-5 py-5">
                      <span
                        className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                          done
                            ? "bg-success text-white"
                            : err
                              ? "bg-danger-light text-danger"
                              : "bg-bg-light text-text-secondary"
                        }`}
                      >
                        {done ? (
                          <Icon icon={Check} size="sm" className="size-3.5" />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <fieldset className="min-w-0 flex-1">
                        <legend className="text-text-primary mb-3 flex flex-wrap items-center gap-2 font-semibold">
                          {question.type === "TEXT" ? (
                            <label htmlFor={`question-${question.id}`}>
                              {question.prompt}
                            </label>
                          ) : (
                            question.prompt
                          )}
                          {!question.required && (
                            <span className="text-text-secondary bg-bg-light rounded-full px-2 py-0.5 text-[11px] font-medium">
                              Optional
                            </span>
                          )}
                        </legend>
                        {question.type === "TEXT" ? (
                          <Input
                            id={`question-${question.id}`}
                            value={textAnswers[question.id] ?? ""}
                            error={!!err}
                            aria-describedby={errId}
                            placeholder="Type your answer"
                            onChange={(e) =>
                              setTextAnswer(question.id, e.target.value)
                            }
                          />
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {question.options.map((option) => {
                              const checked =
                                optionAnswers[question.id]?.has(option.id) ??
                                false;
                              const radio = question.type === "RADIO";
                              return (
                                <label
                                  key={option.id}
                                  className={`text-small has-[:focus-visible]:ring-primary/40 inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-medium transition-colors has-[:focus-visible]:ring-2 ${
                                    checked
                                      ? "border-primary bg-primary text-white"
                                      : err
                                        ? "border-danger/60 text-text-primary hover:border-primary"
                                        : "border-border-hover text-text-primary hover:border-primary"
                                  }`}
                                >
                                  <input
                                    type={radio ? "radio" : "checkbox"}
                                    className="sr-only"
                                    id={`question-${question.id}-${option.id}`}
                                    name={`question-${question.id}`}
                                    checked={checked}
                                    aria-describedby={errId}
                                    onChange={() =>
                                      radio
                                        ? selectRadioOption(
                                            question.id,
                                            option.id,
                                          )
                                        : toggleCheckboxOption(
                                            question.id,
                                            option.id,
                                          )
                                    }
                                  />
                                  {checked && (
                                    <Icon
                                      icon={Check}
                                      size="sm"
                                      className="size-3.5"
                                    />
                                  )}
                                  {option.label}
                                </label>
                              );
                            })}
                          </div>
                        )}
                        {err && (
                          <p
                            id={errId}
                            className="text-danger mt-2 text-xs font-medium"
                          >
                            {err}
                          </p>
                        )}

                        {/* "Other (please specify)" and follow-up tree sit
                            under the chips, for each selected choice. */}
                        {question.type === "CHECKBOX" &&
                          question.options.map((option) => {
                            if (!optionAnswers[question.id]?.has(option.id))
                              return null;
                            const other =
                              question.allowOther &&
                              isOtherChoice(option.label);
                            const followup =
                              option.advancedEnabled &&
                              !isOtherChoice(option.label) &&
                              option.advancedOptions.length > 0;
                            if (!other && !followup) return null;
                            return (
                              <div key={option.id} className="mt-3">
                                {other && (
                                  <FormField
                                    label="Please specify"
                                    htmlFor={`question-${question.id}-other-text`}
                                    required
                                    error={
                                      questionErrors[`${question.id}-other`]
                                    }
                                  >
                                    <Input
                                      id={`question-${question.id}-other-text`}
                                      maxLength={1000}
                                      value={otherAnswers[question.id] ?? ""}
                                      error={
                                        !!questionErrors[`${question.id}-other`]
                                      }
                                      onChange={(e) =>
                                        setOtherAnswers((prev) => ({
                                          ...prev,
                                          [question.id]: e.target.value,
                                        }))
                                      }
                                    />
                                  </FormField>
                                )}
                                {followup && renderFollowup(option)}
                              </div>
                            );
                          })}
                      </fieldset>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {/* the audio clip */}
          {audioOpen && (
            <section className="border-border-light bg-surface-light rounded-lg border">
              <header className="border-border-light flex items-center justify-between gap-3 border-b px-5 py-4">
                <div>
                  <h2 className="text-text-primary font-bold">
                    Your audio clip
                  </h2>
                  <p className="text-small text-text-secondary">
                    {submittedUrl
                      ? "Already submitted — add a new one only to replace it."
                      : "Pick whichever is easiest."}
                  </p>
                </div>
                {submittedUrl && (
                  <a
                    href={submittedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-small text-primary inline-flex shrink-0 items-center gap-1 font-semibold hover:underline"
                  >
                    View current submission{" "}
                    <Icon icon={ExternalLink} size="sm" className="size-3.5" />
                  </a>
                )}
              </header>
              <div className="space-y-4 p-5">
                <div
                  role="radiogroup"
                  aria-label="How to submit"
                  className="grid grid-cols-3 gap-2"
                >
                  {MODE_TILES.map((t) => {
                    const on = mode === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={submitting}
                        onClick={() => handleModeChange(t.value)}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-center transition-colors ${
                          on
                            ? "border-primary bg-primary-light"
                            : "border-border-light hover:border-border-hover"
                        }`}
                      >
                        <span
                          className={`grid size-9 place-items-center rounded-full ${on ? "bg-primary text-white" : "bg-bg-light text-text-secondary"}`}
                        >
                          <Icon icon={t.icon} size="sm" />
                        </span>
                        <span className="text-small text-text-primary font-semibold">
                          {t.label}
                        </span>
                        <span className="text-text-secondary hidden text-[11px] sm:block">
                          {t.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="bg-bg-subtle rounded-lg p-4">
                  {mode === "record" && (
                    <AudioRecorder
                      onRecordingComplete={setAudioBlob}
                      onClear={() => setAudioBlob(null)}
                      maxDurationMs={6 * 60 * 1000}
                      disabled={submitting}
                    />
                  )}

                  {mode === "upload" && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".mp3,.wav,.m4a,.mp4,.aac,.ogg,.oga,.flac,.caf,.amr,.3gp,.3gpp"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      {audioBlob instanceof File ? (
                        <div className="border-border-light bg-surface-light flex items-center gap-3 rounded-md border p-3">
                          <span className="bg-primary-light text-primary grid size-10 shrink-0 place-items-center rounded-md">
                            <Icon icon={FileAudio} size="sm" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="text-small text-text-primary block truncate font-semibold">
                              {audioBlob.name}
                            </span>
                            <span className="text-text-secondary text-xs">
                              {(audioBlob.size / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={submitting}
                            onClick={() => {
                              setAudioBlob(null);
                              fileInputRef.current?.click();
                            }}
                          >
                            Change
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => fileInputRef.current?.click()}
                          className="border-border-hover hover:border-primary hover:bg-surface-light flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors"
                        >
                          <Icon
                            icon={Upload}
                            size="md"
                            className="text-text-secondary"
                          />
                          <span className="text-small text-text-primary font-semibold">
                            Choose an audio file
                          </span>
                          <span className="text-text-secondary text-xs">
                            MP3, WAV, M4A and more · up to 20MB
                          </span>
                        </button>
                      )}
                    </>
                  )}

                  {mode === "link" && (
                    <FormField
                      label="Audio Submission URL"
                      htmlFor="audio-url"
                      required={audioRequired}
                      error={
                        error === "Audio submission URL is required."
                          ? error
                          : undefined
                      }
                    >
                      <Input
                        id="audio-url"
                        type="url"
                        value={audioUrl}
                        error={error === "Audio submission URL is required."}
                        onChange={(e) => setAudioUrl(e.target.value)}
                        placeholder="https://drive.google.com/… or https://youtu.be/…"
                      />
                      <p className="text-text-secondary mt-2 text-xs">
                        Upload to Google Drive or YouTube (unlisted is fine) and
                        set sharing to &quot;Anyone with the link&quot;. A
                        private link the reviewer can&apos;t open counts as no
                        submission.
                      </p>
                    </FormField>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* save bar */}
          <div className="border-border-light bg-surface-light/95 sticky bottom-0 z-10 -mx-4 space-y-2 border-t px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:shadow-lg">
            {error && error !== "Audio submission URL is required." && (
              <p
                role="alert"
                className="text-danger text-small flex items-center gap-1.5 font-medium"
              >
                <Icon
                  icon={AlertTriangle}
                  size="sm"
                  className="size-4 shrink-0"
                />{" "}
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-small text-text-secondary">
                {tasksTotal === 0 || tasksDone === tasksTotal ? (
                  <span className="text-success inline-flex items-center gap-1 font-semibold">
                    <Icon icon={Check} size="sm" className="size-4" /> Ready to
                    save
                  </span>
                ) : (
                  <>
                    <span className="text-text-primary font-semibold tabular-nums">
                      {tasksDone} of {tasksTotal}
                    </span>{" "}
                    required done
                  </>
                )}
              </p>
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={submitting}
              >
                {submitting
                  ? "Saving…"
                  : nothingNeeded
                    ? "View your ticket"
                    : "Save & view ticket"}
                {!submitting && <Icon icon={ArrowRight} size="sm" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
