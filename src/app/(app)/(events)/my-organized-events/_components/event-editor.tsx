"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CircleAlert,
  ClipboardList,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Link2,
  MessageCircleQuestion,
  ListOrdered,
  Monitor,
  RotateCcw,
  Smartphone,
  Ticket,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button, Icon } from "@/components/atoms";
import { Banner, Chip, FormField, Modal } from "@/components/molecules";
import { useWizardStore } from "@/lib/store/wizard-store";
import { useLookup } from "@/hooks/use-lookup";
import { useServerNow } from "@/hooks/use-server-now";
import { useSession } from "@/hooks/use-session";
import { getEventTypes, getModes, getStatuses } from "@/lib/api/lookups";
import {
  adaptApiEvent,
  blankEventDetail,
  draftToPreviewDetail,
} from "@/lib/api/adapters";
import { ApiError } from "@/lib/api/client";
import type { EventDetail } from "@/lib/api/types";
import type { Event } from "@/lib/event";
import { EventDetailData, initialEventData } from "@/lib/zod/event";
import {
  AboutSection,
  EventCover,
  EventHeading,
  EventMeta,
  EventPills,
  FaqSection,
  LocationSection,
  MediaSection,
  ScheduleSection,
  TermsSection,
  TicketsCard,
  WhoSection,
  getEventState,
} from "@/app/(public)/events/[id]/_components/event-sections";
import { EventLinksCard } from "@/app/(public)/events/[id]/_components/event-links-card";

import { StepDetails } from "./step-details";
import { StepRegistration } from "./step-registration";
import { StepScheduleMode } from "./step-schedule-mode";
import { StepTimelineLinks } from "./step-timeline-links";
import { StepAdditionalInfo } from "./step-additional-info";
import { StepTerms } from "./step-terms";
import { StepFaqs } from "./step-faqs";
// TODO(dashboard-port): remove the Rounds tab once the dashboard Rounds page exists.
import { StepRounds } from "./step-rounds";
import {
  createEventFromDraft,
  updateEventFromDraft,
  type SaveResult,
} from "./save-event";

// Create + edit. Tabs pick a section; its form sits beside a preview of just
// the part of the event page that section controls, rendered at real size
// with the same components attendees see. Preview can be hidden; edited
// sections can flip Before/After. Save works from any tab.

type SectionId =
  | "details"
  | "schedule"
  | "passes"
  | "agenda"
  | "terms"
  | "faqs"
  | "links"
  | "info"
  // TODO(dashboard-port): remove once the dashboard Rounds page exists.
  | "rounds";

interface SectionDef {
  id: SectionId;
  tab: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  onPage: boolean;
}

const SECTIONS: SectionDef[] = [
  {
    id: "details",
    tab: "Details",
    title: "Event details",
    hint: "What it is, what it's called, and the story attendees read first.",
    icon: FileText,
    onPage: true,
  },
  {
    id: "schedule",
    tab: "Date & venue",
    title: "Schedule & mode",
    hint: "When and how attendees will join.",
    icon: CalendarDays,
    onPage: true,
  },
  {
    id: "passes",
    tab: "Passes",
    title: "Passes",
    hint: "Who can register, for how much, and when.",
    icon: Ticket,
    onPage: true,
  },
  {
    id: "agenda",
    tab: "Agenda",
    title: "Agenda",
    hint: "The run of show, session by session.",
    icon: ListOrdered,
    onPage: true,
  },
  {
    id: "terms",
    tab: "Who & terms",
    title: "Who & terms",
    hint: "Who it's for, and the fine print.",
    icon: Users,
    onPage: true,
  },
  {
    id: "faqs",
    tab: "FAQs",
    title: "FAQs",
    hint: "Answers to what people ask before booking.",
    icon: MessageCircleQuestion,
    onPage: true,
  },
  {
    id: "links",
    tab: "Links & media",
    title: "Links & media",
    hint: "Socials, community links and extra media.",
    icon: Link2,
    onPage: true,
  },
  {
    id: "info",
    tab: "Registration form",
    title: "Registration form",
    hint: "Extra questions asked at sign-up.",
    icon: ClipboardList,
    onPage: false,
  },
  // TODO(dashboard-port): remove once the dashboard Rounds page exists.
  {
    id: "rounds",
    tab: "Rounds",
    title: "Rounds",
    hint: "Screening, semi-finals and finals, with scoring rubrics.",
    icon: Trophy,
    onPage: false,
  },
];

// Readable names for the unsaved-changes list.
const FIELD_LABELS: Partial<Record<keyof EventDetailData, string>> = {
  title: "Title",
  summary: "Summary",
  description: "Description",
  coverImageUrl: "Cover image",
  type: "Event type",
  categoryIds: "Categories",
  priceAmount: "Ticket price",
  capacity: "Capacity",
  date: "Date",
  time: "Start time",
  duration: "Duration",
  mode: "Mode",
  location: "Venue",
  city: "City",
  participationLink: "Meeting link",
  timeline: "Agenda",
  mediaUrls: "Media",
  socialLinks: "Links",
  faqs: "FAQs",
  stages: "Days & format",
  rounds: "Rounds",
  advancedAdditionalQuestionsEnabled: "Follow-up questions",
  questions: "Registration questions",
  eligibility: "Who it's for",
  terms: "Terms",
};

function sectionOf(key: keyof EventDetailData): SectionId | null {
  if (
    [
      "type",
      "categoryIds",
      "title",
      "summary",
      "description",
      "coverImageUrl",
    ].includes(key)
  )
    return "details";
  if (key === "timeline") return "agenda";
  if (key === "faqs") return "faqs";
  if (key === "socialLinks" || key === "mediaUrls") return "links";
  if (
    key === "questions" ||
    key === "advancedAdditionalQuestionsEnabled" ||
    key.startsWith("audioRecording")
  )
    return "info";
  // TODO(dashboard-port): remove with the Rounds tab.
  if (key === "rounds") return "rounds";
  if (key === "terms" || key === "eligibility") return "terms";
  if (
    [
      "date",
      "time",
      "duration",
      "mode",
      "location",
      "city",
      "participationLink",
      "stages",
    ].includes(key)
  )
    return "schedule";
  if (
    key.startsWith("attendee") ||
    key.startsWith("participant") ||
    key === "priceAmount" ||
    key === "capacity" ||
    key === "certificate"
  )
    return "passes";
  return null;
}

function changeLabel(key: keyof EventDetailData): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]!;
  if (key.startsWith("attendee")) return "Attendee pass";
  if (key.startsWith("participant")) return "Participant pass";
  if (key.startsWith("audioRecording")) return "Audio recording";
  return String(key);
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

// Steps open with their own "<h2> + intro"; the card header replaces it.
const HIDE_STEP_HEADER = "[&>div>div:first-child:has(>h2)]:hidden";
const PREVIEW_KEY = "gcode:editor-preview";

type Device = "web" | "phone";

export type EventEditorProps =
  | { mode: "create" }
  | {
      mode: "edit";
      eventId: string;
      initialData: EventDetailData;
      /** The saved row — server-owned values (counts, organizer) for the preview. */
      baseDetail: EventDetail;
    };

export function EventEditor(props: EventEditorProps) {
  const router = useRouter();
  const now = useServerNow();
  const session = useSession();
  const isEdit = props.mode === "edit";
  const eventId = isEdit ? props.eventId : undefined;
  const initialData = isEdit ? props.initialData : initialEventData;
  const baseDetail = useMemo(
    () =>
      isEdit ? props.baseDetail : blankEventDetail(session?.fullName || "You"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isEdit, eventId, session?.fullName],
  );

  const data = useWizardStore((s) => s.data);
  const update = useWizardStore((s) => s.update);
  const resetWizard = useWizardStore((s) => s.reset);

  const [section, setSection] = useState<SectionId>("details");
  const [device, setDevice] = useState<Device>("web");
  const [previewOn, setPreviewOn] = useState(true);
  const [showBefore, setShowBefore] = useState(false);
  const [saving, setSaving] = useState<"save" | "draft" | "publish" | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<{
    text: string;
    href: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<"discard" | "leave" | null>(null);

  useEffect(() => {
    resetWizard(isEdit ? initialData : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Show/hide preview is a per-viewer preference.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREVIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved !== null) setPreviewOn(saved === "1");
    } catch {
      // storage unavailable — keep the default
    }
  }, []);
  function setPreview(next: boolean) {
    setPreviewOn(next);
    try {
      localStorage.setItem(PREVIEW_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  // ------------------------------------------------------------- lookups
  const { data: types } = useLookup(getEventTypes);
  const { data: modes } = useLookup(getModes);
  const { data: statuses } = useLookup(getStatuses);
  const statusCodes = useMemo(
    () => Object.fromEntries(statuses.map((s) => [s.id, s.status_code])),
    [statuses],
  );
  const statusId = (code: string) =>
    statuses.find((s) => s.status_code === code)?.id;
  const isDraft = !isEdit || statusCodes[baseDetail.status_id] === "DRAFT";

  // ---------------------------------------------- changes + required fields
  const changedKeys = useMemo(
    () =>
      (Object.keys(data) as (keyof EventDetailData)[]).filter(
        (k) => !same(data[k], initialData[k]),
      ),
    [data, initialData],
  );
  const changedLabels = [...new Set(changedKeys.map(changeLabel))];
  const editedSections = new Set(changedKeys.map(sectionOf));
  const dirty = changedKeys.length > 0;

  const missing: { label: string; section: SectionId }[] = [
    ...(data.type === null
      ? [{ label: "Event type", section: "details" as const }]
      : []),
    ...(!data.title.trim()
      ? [{ label: "Title", section: "details" as const }]
      : []),
    ...(!data.description.trim()
      ? [{ label: "Description", section: "details" as const }]
      : []),
  ];
  const valid = missing.length === 0;
  const missingIn = new Set(missing.map((m) => m.section));

  // -------------------------------------------------------------- preview
  const toEvent = useMemo(() => {
    if (!types.length || !modes.length) return undefined;
    const typeNames = Object.fromEntries(types.map((t) => [t.id, t.name]));
    const modeNames = Object.fromEntries(modes.map((m) => [m.id, m.mode_name]));
    return (draft: EventDetailData): Event => {
      const event = adaptApiEvent(
        draftToPreviewDetail(baseDetail, draft),
        typeNames,
        modeNames,
        statusCodes,
      );
      return {
        ...event,
        title: event.title || "Untitled event",
        timeline: draft.timeline.filter((t) => t.title.trim() !== ""),
        socialLinks: draft.socialLinks.filter((l) => l.url.trim() !== ""),
        faqs: draft.faqs.filter((f) => f.question.trim() && f.answer.trim()),
        mediaUrls: draft.mediaUrls.filter((u) => u.trim() !== ""),
      };
    };
  }, [types, modes, statusCodes, baseDetail]);

  const draftEvent = useMemo(() => toEvent?.(data), [toEvent, data]);
  const savedEvent = useMemo(
    () => toEvent?.(initialData),
    [toEvent, initialData],
  );

  // Rounds/judging are configured on the event dashboard (Rounds), not
  // here — this editor is only what the public event page shows.
  const sections = SECTIONS;
  const current = sections.find((s) => s.id === section) ?? sections[0];
  const canCompare = isEdit && editedSections.has(current.id);
  const previewing = showBefore && canCompare ? savedEvent : draftEvent;
  const showPanel = previewOn && current.onPage;

  function openSection(id: SectionId) {
    setSection(id);
    setShowBefore(false);
  }

  // ----------------------------------------------------------------- save
  async function save(kind: "save" | "draft" | "publish") {
    if (!valid) {
      openSection(missing[0].section);
      return;
    }
    setSaving(kind);
    setSaveError(null);
    setSaveWarning(null);
    try {
      const status =
        kind === "publish"
          ? statusId("OPEN")
          : kind === "draft"
            ? statusId("DRAFT")
            : baseDetail.status_id;
      let id = eventId;
      let result: SaveResult;
      if (isEdit && eventId) {
        result = await updateEventFromDraft(eventId, data, status, initialData);
      } else {
        result = await createEventFromDraft(data, status);
      }
      id = String(result.id);
      if (result.warnings.length > 0) {
        // The event is saved; stay put so the warning can be read first.
        setSaveWarning({
          text: result.warnings.join(" · "),
          href: `/my-organized-events/${id}`,
        });
        setSaving(null);
        return;
      }
      router.push(`/my-organized-events/${id}`);
    } catch (error) {
      setSaveError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Couldn't save this event. Try again.",
      );
      setSaving(null);
    }
  }

  const exitHref = isEdit
    ? `/my-organized-events/${eventId}`
    : "/my-organized-events";

  function form(id: SectionId): ReactNode {
    switch (id) {
      case "details":
        return (
          <div className="space-y-6">
            <FormField label="Event type" htmlFor="event-type" required>
              <div id="event-type" className="flex flex-wrap gap-2">
                {types.map((t) => (
                  <Chip
                    key={t.id}
                    selected={data.type === t.id}
                    onClick={() => update("type", t.id)}
                  >
                    {t.name}
                  </Chip>
                ))}
              </div>
            </FormField>
            <StepDetails data={data} onChange={update} />
          </div>
        );
      case "schedule":
        return <StepScheduleMode data={data} onChange={update} />;
      case "passes":
        return <StepRegistration data={data} onChange={update} />;
      case "agenda":
        return (
          <StepTimelineLinks
            data={data}
            onChange={update}
            parts={["timeline"]}
          />
        );
      case "links":
        return (
          <StepTimelineLinks
            data={data}
            onChange={update}
            parts={["links", "media"]}
          />
        );
      case "terms":
        return <StepTerms data={data} onChange={update} />;
      case "faqs":
        return <StepFaqs data={data} onChange={update} />;
      case "info":
        return <StepAdditionalInfo data={data} onChange={update} />;
      // TODO(dashboard-port): remove with the Rounds tab.
      case "rounds":
        return <StepRounds data={data} onChange={update} />;
    }
  }

  return (
    <div>
      {/* ------------------------------------------------------ action bar */}
      <div className="bg-background/90 sticky top-0 z-20 -mt-10 flex min-h-16 flex-wrap items-center gap-x-4 gap-y-3 pt-6 pb-3 backdrop-blur-md">
        <Link
          href={exitHref}
          onClick={(e) => {
            if (!dirty) return;
            e.preventDefault();
            setConfirm("leave");
          }}
          className="bg-surface-light border-border-light text-text-secondary hover:text-text-primary flex size-10 items-center justify-center rounded-full border shadow-sm transition-colors"
          aria-label={isEdit ? "Back to event dashboard" : "Back to Organizing"}
        >
          <Icon icon={ArrowLeft} size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-text-secondary text-xs font-semibold tracking-wider uppercase">
            {isEdit ? "Editing" : "New event"}
          </p>
          <h1 className="text-text-primary truncate text-xl font-extrabold">
            {data.title || "Untitled event"}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {dirty && (
            <span
              className="text-small text-text-secondary hidden items-center gap-2 md:inline-flex"
              title={changedLabels.join(", ")}
            >
              <span className="bg-warning size-2 rounded-full" />
              {isEdit
                ? `${changedLabels.length} unsaved ${changedLabels.length === 1 ? "change" : "changes"}`
                : "Not saved yet"}
            </span>
          )}
          {isEdit && (
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty || !!saving}
              onClick={() => setConfirm("discard")}
            >
              <Icon icon={RotateCcw} size="sm" className="size-3.5" />
              Discard
            </Button>
          )}
          {isEdit && !isDraft ? (
            <Button
              variant="primary"
              disabled={!dirty || !!saving}
              loading={saving === "save"}
              onClick={() => save("save")}
            >
              Save changes
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={(isEdit && !dirty) || !!saving}
                loading={saving === "draft"}
                onClick={() => save("draft")}
              >
                Save draft
              </Button>
              <Button
                variant="primary"
                disabled={!!saving}
                loading={saving === "publish"}
                onClick={() => save("publish")}
              >
                Publish
              </Button>
            </>
          )}
        </div>
      </div>

      {saveError && (
        <div className="mt-4">
          <Banner tone="danger">{saveError}</Banner>
        </div>
      )}
      {saveWarning && (
        <div className="mt-4">
          <Banner tone="warning">
            Event saved, but {saveWarning.text}.{" "}
            <Link href={saveWarning.href} className="font-semibold underline">
              Continue to the event
            </Link>
          </Banner>
        </div>
      )}

      {/* ----------------------------------------------------------- tabs */}
      <div className="border-border-light mt-2 flex items-end gap-4 border-b">
        <nav
          aria-label="Edit sections"
          className="flex min-w-0 flex-1 [scrollbar-width:none] gap-7 overflow-x-auto"
        >
          {sections.map((s) => {
            const active = s.id === current.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => openSection(s.id)}
                aria-current={active ? "page" : undefined}
                className={`relative flex shrink-0 items-center gap-1.5 pt-1 pb-3 font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "text-text-primary font-semibold"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {s.tab}
                {missingIn.has(s.id) ? (
                  <span
                    aria-label="required fields missing"
                    className="bg-secondary size-1.5 rounded-full"
                  />
                ) : (
                  editedSections.has(s.id) && (
                    <span
                      aria-label="edited"
                      className="bg-warning size-1.5 rounded-full"
                    />
                  )
                )}
                {active && (
                  <span className="bg-secondary absolute inset-x-0 -bottom-px h-0.5 rounded-full" />
                )}
              </button>
            );
          })}
        </nav>
        {!previewOn && current.onPage && (
          <button
            type="button"
            onClick={() => setPreview(true)}
            className="text-small text-text-secondary hover:text-text-primary mb-2.5 hidden shrink-0 items-center gap-1.5 font-semibold lg:flex"
          >
            <Icon icon={Eye} size="sm" className="size-4" />
            Show preview
          </button>
        )}
      </div>

      {!valid && (
        <p className="text-small text-text-secondary mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Icon
            icon={CircleAlert}
            size="sm"
            className="text-secondary size-4"
          />
          Needed before saving:
          {missing.map((m, i) => (
            <button
              key={m.label}
              type="button"
              onClick={() => openSection(m.section)}
              className="text-text-primary font-semibold underline-offset-2 hover:underline"
            >
              {m.label}
              {i < missing.length - 1 ? "," : ""}
            </button>
          ))}
        </p>
      )}

      <div
        className={`mt-6 grid items-start gap-8 ${showPanel ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}
      >
        {/* ---------------------------------------------------------- form */}
        <section
          className={`border-border-light bg-surface-light min-w-0 rounded-xl border shadow-sm ${showPanel ? "" : "mx-auto w-full max-w-3xl"}`}
        >
          <header className="border-border-light mx-6 flex items-center gap-4 border-b py-5">
            <span className="bg-bg-light text-text-primary flex size-11 shrink-0 items-center justify-center rounded-lg">
              <Icon icon={current.icon} size="md" />
            </span>
            <div className="min-w-0">
              <h2 className="text-text-primary text-lg font-bold">
                {current.title}
              </h2>
              <p className="text-small text-text-secondary">{current.hint}</p>
            </div>
          </header>
          <div className={`p-6 ${HIDE_STEP_HEADER}`}>
            {form(current.id)}
            {!current.onPage && (
              <p className="text-small text-text-secondary border-border-light mt-6 flex items-center gap-2 border-t pt-4">
                <Icon icon={EyeOff} size="sm" className="size-4 shrink-0" />
                Not shown on the event page — attendees see this while
                registering.
              </p>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------- preview
            Desktop only — on tablet/phone the form gets the full width. */}
        {showPanel && (
          <section className="border-border-light bg-surface-light hidden min-w-0 rounded-xl border p-5 shadow-sm lg:sticky lg:top-20 lg:block">
            <header className="flex items-start gap-3">
              <span className="bg-bg-light text-text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
                <Icon icon={Eye} size="sm" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-text-primary text-lg font-bold">Preview</h2>
                <p className="text-small text-text-secondary">
                  How your event page will look to attendees.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {isEdit && (
                  <a
                    href={`/events/${eventId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Opens the live (saved) page"
                    className="text-small text-text-primary hover:bg-bg-light flex items-center gap-1.5 rounded-sm px-2 py-1.5 font-semibold transition-colors"
                  >
                    Open in new tab
                    <Icon icon={ExternalLink} size="sm" className="size-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreview(false)}
                  className="text-text-secondary hover:text-text-primary hover:bg-bg-light flex size-8 items-center justify-center rounded-sm transition-colors"
                  aria-label="Hide preview"
                  title="Hide preview"
                >
                  <Icon icon={EyeOff} size="sm" className="size-4" />
                </button>
              </div>
            </header>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <Segmented
                value={device}
                onChange={setDevice}
                options={[
                  ["web", "Web", Monitor],
                  ["phone", "Phone", Smartphone],
                ]}
              />
              {canCompare && (
                <Segmented
                  value={showBefore ? "before" : "after"}
                  onChange={(v) => setShowBefore(v === "before")}
                  options={[
                    ["before", "Before"],
                    ["after", "After"],
                  ]}
                />
              )}
            </div>

            <div className="mt-4">
              {!previewing ? (
                <div className="bg-bg-light h-72 animate-pulse rounded-lg" />
              ) : device === "web" ? (
                <div className="border-border-light overflow-hidden rounded-lg border">
                  <div className="border-border-light bg-surface-light flex items-center gap-3 border-b px-3 py-2">
                    <span className="flex gap-1.5">
                      <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                      <span className="size-2.5 rounded-full bg-[#febc2e]" />
                      <span className="size-2.5 rounded-full bg-[#28c840]" />
                    </span>
                    <span className="bg-bg-light text-text-secondary min-w-0 flex-1 truncate rounded-full px-3 py-1 text-xs">
                      events.gcode.in/events/{eventId ?? "new"}
                    </span>
                  </div>
                  <div className="bg-background max-h-[calc(100dvh-25rem)] min-h-64 overflow-y-auto p-5">
                    <SectionPreview
                      section={current.id}
                      event={previewing}
                      now={now}
                      device="web"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex justify-center">
                  <div className="bg-primary w-[402px] max-w-full rounded-[2.25rem] p-1.5 shadow-lg">
                    <div className="bg-background relative h-[min(44rem,calc(100dvh-24rem))] overflow-hidden rounded-[1.9rem]">
                      <div className="bg-primary absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full" />
                      <div className="h-full overflow-y-auto px-4 pt-10 pb-6">
                        <SectionPreview
                          section={current.id}
                          event={previewing}
                          now={now}
                          device="phone"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm === "leave" ? "Leave without saving?" : "Discard changes?"
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Keep editing
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (confirm === "leave") router.push(exitHref);
                else resetWizard(initialData);
                setConfirm(null);
              }}
            >
              {confirm === "leave" ? "Leave" : "Discard"}
            </Button>
          </>
        }
      >
        <p className="text-body text-text-secondary">
          {isEdit ? (
            <>
              {changedLabels.length} unsaved{" "}
              {changedLabels.length === 1 ? "change" : "changes"}:{" "}
              <span className="text-text-primary font-medium">
                {changedLabels.join(", ")}
              </span>
              .
            </>
          ) : (
            "This event hasn't been saved. Leaving now will discard it."
          )}
        </p>
      </Modal>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string, LucideIcon?])[];
}) {
  return (
    <div className="bg-bg-light flex gap-1 rounded-md p-1">
      {options.map(([id, label, icon]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`text-small flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-medium transition-colors ${
            value === id
              ? "bg-surface-light text-text-primary border-border-hover border shadow-sm"
              : "text-text-secondary hover:text-text-primary border border-transparent"
          }`}
        >
          {icon && <Icon icon={icon} size="sm" className="size-4" />}
          {label}
        </button>
      ))}
    </div>
  );
}

// Labelled cut-out stand-in for a part of the page this section doesn't
// touch — shows where the real component sits without taking its space.
function Sk({
  label,
  className = "h-8",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`bg-bg-light text-text-secondary/70 border-border-light flex items-center justify-center rounded-md border border-dashed text-[10px] font-semibold tracking-widest uppercase ${className}`}
    >
      {label}
    </div>
  );
}

// Only the components a section's fields change, at real size, in page
// order — everything around them collapsed to small skeletons.
function SectionPreview({
  section,
  event,
  now,
  device,
}: {
  section: SectionId;
  event: Event;
  now: Date;
  device: Device;
}) {
  const state = getEventState(event, now);
  const pills = (
    <div className="flex flex-wrap items-center gap-2">
      <EventPills event={event} state={state} />
    </div>
  );
  const banner = <Sk label="Banner" className="h-10" />;

  switch (section) {
    case "details":
      return (
        <div className="space-y-5">
          <EventCover event={event} state={state} />
          {pills}
          <EventHeading event={event} state={state} showMeta={false} />
          <Sk label="Date · Time" className="h-6 w-56" />
          <AboutSection event={event} />
          <Sk label="Schedule · Location · Terms" />
        </div>
      );
    case "schedule":
      return (
        <div className="space-y-5">
          {banner}
          {pills}
          <Sk label="Title · Summary" className="h-12" />
          <EventMeta event={event} state={state} />
          <Sk label="About · Schedule" />
          <LocationSection event={event} state={state} />
          <Sk label="Who it's for · Terms" />
        </div>
      );
    case "passes":
      return device === "web" ? (
        <div className="space-y-5">
          {banner}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,360px)] gap-5">
            <Sk label="Event details" className="h-full min-h-40" />
            <TicketsCard event={event} state={state} />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {banner}
          <Sk label="Event details" className="h-16" />
          <TicketsCard event={event} state={state} />
        </div>
      );
    case "agenda":
      return (
        <div className="space-y-5">
          {banner}
          <Sk label="Title · About" className="h-12" />
          <ScheduleSection event={event} />
          <Sk label="Location · Who it's for · Terms" />
        </div>
      );
    case "links":
      return (
        <div className="space-y-5">
          {banner}
          <Sk label="Title · Summary" className="h-10" />
          <Sk label="About" />
          {(event.mediaUrls ?? []).length > 0 ? (
            <MediaSection event={event} />
          ) : (
            <Sk label="Media — add a link to show it here" className="h-12" />
          )}
          <Sk
            label="Schedule · Location · Who it's for · Terms"
            className="h-12"
          />
          {event.socialLinks && event.socialLinks.length > 0 ? (
            <EventLinksCard links={event.socialLinks} />
          ) : (
            <Sk
              label="Follow along — add a link to show it here"
              className="h-12"
            />
          )}
        </div>
      );
    case "terms":
      return (
        <div className="space-y-5">
          {banner}
          <Sk label="Title · About · Schedule · Location" className="h-12" />
          <WhoSection event={event} />
          <TermsSection event={event} />
        </div>
      );
    case "faqs":
      return (
        <div className="space-y-5">
          {banner}
          <Sk
            label="Title · About · Schedule · Who it's for · Terms"
            className="h-12"
          />
          {(event.faqs ?? []).length > 0 ? (
            <FaqSection event={event} />
          ) : (
            <Sk
              label="FAQs — add a question and answer to show it here"
              className="h-12"
            />
          )}
        </div>
      );
    default:
      return null;
  }
}
