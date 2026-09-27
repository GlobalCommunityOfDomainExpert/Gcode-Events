"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  Compass,
  ExternalLink,
  FileAudio,
  LucideIcon,
  Upload,
} from "lucide-react";
import {
  Button,
  Card,
  Checkbox,
  Icon,
  Input,
  Label,
  Radio,
  SectionLabel,
} from "@/components/atoms";
import {
  AudioRecorder,
  Banner,
  Breadcrumb,
  Modal,
  NotFoundState,
  ToggleGroup,
} from "@/components/molecules";
import { useEvent } from "@/hooks/use-event";
import {
  getParticipant,
  listParticipantAnswers,
  replaceParticipantAnswers,
  submitParticipantAudio,
  uploadParticipantAudio,
} from "@/lib/api/participants";
import { ApiError } from "@/lib/api/client";
import { ParticipantApi } from "@/lib/api/types";
import { EventQuestion } from "@/lib/event";

const SUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000;

type SubmissionMode = "record" | "upload" | "link";

const SUBMISSION_MODE_OPTIONS: { value: SubmissionMode; label: string }[] = [
  { value: "record", label: "Record Audio" },
  { value: "upload", label: "Upload File" },
  { value: "link", label: "Paste a Link" },
];

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
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

// Neutral card + small tone-colored icon badge — same pattern as the
// registered page's success/reminder cards, instead of a solid-fill
// Banner. Used for all three submission-status states below so they read
// as one consistent alert style rather than three different color blocks.
const statusTone = {
  danger: { badge: "bg-danger-light", icon: "text-danger" },
  success: { badge: "bg-success-light", icon: "text-success" },
  warning: { badge: "bg-warning-light", icon: "text-warning" },
} as const;

function StatusCard({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof statusTone;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="border-border-light bg-surface-light flex items-center gap-4 rounded-md border p-6">
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${statusTone[tone].badge}`}
      >
        <Icon icon={icon} size="md" className={statusTone[tone].icon} />
      </div>
      <p className="text-body text-text-primary">{children}</p>
    </div>
  );
}

export default function AdditionalInfoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const participantId = searchParams.get("pid");
  const { event } = useEvent(params.id);

  const [participant, setParticipant] = useState<ParticipantApi | undefined>();
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
  const [answersSaving, setAnswersSaving] = useState(false);
  const [answersError, setAnswersError] = useState("");
  const [answersSaved, setAnswersSaved] = useState(false);
  const [answersDirty, setAnswersDirty] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
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
        setSubmittedUrl(row.audio_submission_url ?? null);
        setParticipantStatus("ready");

        const answerRows = await listParticipantAnswers(row.id);
        if (cancelled) return;
        // A TEXT question only ever produces an answer_text row; a
        // RADIO/CHECKBOX question only ever produces option_id rows — so
        // this splits cleanly without needing to know each question's type.
        const initialText: Record<string, string> = {};
        const initialOptions: Record<string, Set<string>> = {};
        for (const answer of answerRows) {
          const questionId = String(answer.question_id);
          if (answer.option_id !== null) {
            const set = initialOptions[questionId] ?? new Set<string>();
            set.add(String(answer.option_id));
            initialOptions[questionId] = set;
          } else if (answer.answer_text !== null) {
            initialText[questionId] = answer.answer_text;
          }
        }
        setTextAnswers(initialText);
        setOptionAnswers(initialOptions);
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
    return (
      <NotFoundState
        icon={Compass}
        title="Loading your registration…"
        description="Fetching your additional info."
        actionHref="/events"
        actionLabel="Browse Events"
      />
    );
  }

  if (participantStatus === "error" || !participant) {
    return (
      <NotFoundState
        icon={Compass}
        title="Registration not found"
        description="We couldn't find this registration. Check the link from your confirmation email."
        actionHref={`/events/${event.id}`}
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
  // falls back to applied_on if the organizer hasn't set one.
  const registrationClosesAt =
    (category === "PARTICIPANT"
      ? event.participantRegistration.registrationDeadlineIso
      : event.attendeeRegistration.registrationDeadlineIso) ??
    participant.applied_on;
  const deadline = new Date(
    new Date(registrationClosesAt).getTime() + SUBMISSION_WINDOW_MS,
  );
  const msRemaining = deadline.getTime() - now.getTime();
  // Window is a hard cutoff — replacing an existing submission is blocked
  // too, matching submit_audio's server-side check (no exemption for rows
  // that already have an audio_submission_url).
  const isPastDeadline = msRemaining <= 0;
  const isDisqualified = isPastDeadline && !submittedUrl;

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
    setAnswersSaved(false);
    setAnswersDirty(true);
    setTextAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function selectRadioOption(questionId: string, optionId: string) {
    setAnswersSaved(false);
    setAnswersDirty(true);
    setOptionAnswers((prev) => ({ ...prev, [questionId]: new Set([optionId]) }));
  }

  function toggleCheckboxOption(questionId: string, optionId: string) {
    setAnswersSaved(false);
    setAnswersDirty(true);
    setOptionAnswers((prev) => {
      const next = new Set(prev[questionId] ?? []);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return { ...prev, [questionId]: next };
    });
  }

  // Required-question check is client-side only, same as the audio
  // deadline's disqualification note above — this only blocks the Save
  // Answers click, nothing enforces it server-side.
  function unansweredRequiredPrompts(): string[] {
    return applicableQuestions
      .filter((q) => q.required)
      .filter((q) => {
        if (q.type === "TEXT") return !textAnswers[q.id]?.trim();
        return !(optionAnswers[q.id]?.size > 0);
      })
      .map((q) => q.prompt);
  }

  async function saveAnswers() {
    const missing = unansweredRequiredPrompts();
    if (missing.length > 0) {
      setAnswersError(`Please answer: ${missing.join(", ")}`);
      return;
    }
    setAnswersSaving(true);
    setAnswersError("");
    setAnswersSaved(false);
    try {
      const items: { questionId: number; optionId?: number; answerText?: string }[] =
        [];
      for (const question of applicableQuestions) {
        if (question.type === "TEXT") {
          const value = textAnswers[question.id]?.trim();
          if (value) {
            items.push({ questionId: Number(question.id), answerText: value });
          }
        } else {
          for (const optionId of optionAnswers[question.id] ?? []) {
            items.push({
              questionId: Number(question.id),
              optionId: Number(optionId),
            });
          }
        }
      }
      await replaceParticipantAnswers(participant!.id, items);
      setAnswersSaved(true);
      setAnswersDirty(false);
    } catch (err) {
      setAnswersError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't save your answers. Please try again.",
      );
    } finally {
      setAnswersSaving(false);
    }
  }

  // Anything the participant typed/recorded/picked but hasn't hit Save/Submit
  // on yet.
  const hasUnsavedChanges =
    answersDirty ||
    audioBlob !== null ||
    (mode === "link" && audioUrl.trim() !== "");

  function goToTicket() {
    router.push(`/events/${event!.id}/registered?pid=${participant!.id}`);
  }

  function handleConfirmClick() {
    if (hasUnsavedChanges) {
      setShowLeaveConfirm(true);
    } else {
      goToTicket();
    }
  }

  function handleModeChange(value: SubmissionMode) {
    setMode(value);
    setAudioBlob(null);
    setAudioUrl("");
    setError("");
  }

  async function handleSubmit() {
    if (mode === "link") {
      if (!isValidUrl(audioUrl.trim())) {
        setError("Enter a valid link (e.g. a Google Drive or YouTube URL).");
        return;
      }
    } else if (!audioBlob) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { audio_submission_url } =
        mode === "link"
          ? await submitParticipantAudio(participant!.id, audioUrl.trim())
          : await uploadParticipantAudio(participant!.id, audioBlob!);
      setSubmittedUrl(audio_submission_url);
      setAudioBlob(null);
      setAudioUrl("");
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't save your submission. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Breadcrumb
          items={[
            { label: "Events", href: "/events" },
            { label: event.type, href: "/events" },
            { label: event.title, href: `/events/${event.id}` },
            { label: "Additional Info" },
          ]}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.back()}
          className="shrink-0"
        >
          <Icon icon={ArrowLeft} size="sm" /> Back
        </Button>
      </div>

      <div>
        <h1 className="text-large text-text-primary font-bold">
          Additional Info — {event.title}
        </h1>
        {audioAppliesToMe && (
          <p className="text-small text-text-secondary">
            You must submit your audio submission URL within 24 hours of
            registration closing, or the entry is disqualified.
          </p>
        )}
      </div>

      {audioAppliesToMe &&
        (isDisqualified ? (
          <StatusCard tone="danger" icon={AlertTriangle}>
            The 24-hour submission window closed on{" "}
            {deadline.toLocaleString()} and no audio was submitted. This
            entry is disqualified. Contact the organizer if you believe this
            is a mistake.
          </StatusCard>
        ) : submittedUrl ? (
          <StatusCard tone="success" icon={Check}>
            {isPastDeadline
              ? "Audio submitted. The submission window has closed, so this entry is locked in — no further changes."
              : `Audio submitted. You can replace it — ${formatCountdown(msRemaining)} left, deadline ${deadline.toLocaleString()}.`}
          </StatusCard>
        ) : (
          <StatusCard tone="warning" icon={Clock}>
            {formatCountdown(msRemaining)} left to submit — deadline{" "}
            {deadline.toLocaleString()}.
          </StatusCard>
        ))}

      {error && <Banner tone="danger">{error}</Banner>}

      {!audioAppliesToMe && applicableQuestions.length === 0 && (
        <StatusCard tone="success" icon={Check}>
          Nothing additional needed for this event.
        </StatusCard>
      )}

      {applicableQuestions.length > 0 && (
        <Card padding="md" className="space-y-5">
          <SectionLabel>Additional Questions</SectionLabel>
          {answersError && <Banner tone="danger">{answersError}</Banner>}
          {applicableQuestions.map((question: EventQuestion) => (
            <div key={question.id} className="space-y-2">
              <Label htmlFor={`question-${question.id}`}>
                {question.prompt}
                {question.required ? " *" : ""}
              </Label>
              {question.type === "TEXT" && (
                <Input
                  id={`question-${question.id}`}
                  value={textAnswers[question.id] ?? ""}
                  onChange={(e) =>
                    setTextAnswer(question.id, e.target.value)
                  }
                />
              )}
              {question.type === "RADIO" && (
                <div className="flex flex-wrap gap-4">
                  {question.options.map((option) => (
                    <Radio
                      key={option.id}
                      name={`question-${question.id}`}
                      label={option.label}
                      checked={
                        optionAnswers[question.id]?.has(option.id) ?? false
                      }
                      onChange={() =>
                        selectRadioOption(question.id, option.id)
                      }
                    />
                  ))}
                </div>
              )}
              {question.type === "CHECKBOX" && (
                <div className="flex flex-wrap gap-4">
                  {question.options.map((option) => (
                    <Checkbox
                      key={option.id}
                      label={option.label}
                      checked={
                        optionAnswers[question.id]?.has(option.id) ?? false
                      }
                      onChange={() =>
                        toggleCheckboxOption(question.id, option.id)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={saveAnswers}
              disabled={answersSaving}
            >
              {answersSaving ? "Saving…" : "Save answers"}
            </Button>
            {answersSaved && (
              <span className="text-small text-success">Saved.</span>
            )}
          </div>
        </Card>
      )}

      {!isPastDeadline && audioAppliesToMe && (
        <Card padding="md" className="space-y-4">
          <SectionLabel>Submit your audio</SectionLabel>
          <ToggleGroup
            options={SUBMISSION_MODE_OPTIONS}
            value={mode}
            onChange={(value) => handleModeChange(value as SubmissionMode)}
          />

          {mode === "record" && (
            <>
              <p className="text-small text-text-secondary">
                Up to 6 minutes. Record right here in the browser, then submit
                before the 24h deadline — after that the entry is disqualified
                regardless of the recording itself.
              </p>
              <AudioRecorder
                onRecordingComplete={setAudioBlob}
                onClear={() => setAudioBlob(null)}
                maxDurationMs={6 * 60 * 1000}
                disabled={submitting}
              />
            </>
          )}

          {mode === "upload" && (
            <>
              <p className="text-small text-text-secondary">
                Choose an audio file already on your device — MP3, WAV, M4A,
                etc. Up to 20MB.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.m4a,.mp4,.aac,.ogg,.oga,.flac,.caf,.amr,.3gp,.3gpp"
                onChange={handleFileChange}
                className="hidden"
              />
              {audioBlob instanceof File ? (
                <div className="border-border-light bg-surface-light flex flex-wrap items-center gap-3 rounded-md border p-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon
                      icon={FileAudio}
                      size="sm"
                      className="text-text-secondary shrink-0"
                    />
                    <span className="text-small text-text-primary truncate">
                      {audioBlob.name}
                    </span>
                    <span className="text-small text-text-secondary shrink-0">
                      ({(audioBlob.size / (1024 * 1024)).toFixed(1)} MB)
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    disabled={submitting}
                    onClick={() => {
                      setAudioBlob(null);
                      fileInputRef.current?.click();
                    }}
                  >
                    Choose Different File
                  </Button>
                </div>
              ) : (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Icon icon={Upload} size="sm" />
                    Choose File
                  </Button>
                </div>
              )}
            </>
          )}

          {mode === "link" && (
            <>
              <p className="text-small text-text-secondary">
                Upload to Google Drive or YouTube (unlisted is fine), set
                sharing to &quot;Anyone with the link&quot;, then paste it
                below. A private link the reviewer can&apos;t open counts as no
                submission.
              </p>
              <div className="space-y-1">
                <Label htmlFor="audio-url">Audio Submission URL</Label>
                <Input
                  id="audio-url"
                  type="url"
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/... or https://youtu.be/..."
                />
              </div>
            </>
          )}

          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={
              submitting ||
              (mode === "link" ? audioUrl.trim() === "" : !audioBlob)
            }
          >
            {submitting
              ? "Saving…"
              : submittedUrl
                ? "Replace Submission"
                : "Submit"}
          </Button>
          {submittedUrl && (
            <a
              href={submittedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-small text-primary flex items-center gap-1"
            >
              View current submission <Icon icon={ExternalLink} size="sm" />
            </a>
          )}
        </Card>
      )}

      <div className="flex justify-end">
        <Button variant="primary" onClick={handleConfirmClick}>
          Confirm
        </Button>
      </div>

      <Modal
        open={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        title="Unsaved changes"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowLeaveConfirm(false)}
            >
              Stay and save
            </Button>
            <Button variant="primary" onClick={goToTicket}>
              Leave without saving
            </Button>
          </>
        }
      >
        <p className="text-body text-text-secondary">
          You have unsaved changes — an in-progress audio submission, or
          answer edits you haven&apos;t saved yet. Leaving
          now
          will discard them.
        </p>
      </Modal>
    </div>
  );
}
