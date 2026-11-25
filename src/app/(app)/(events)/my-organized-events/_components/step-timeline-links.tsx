"use client";

import { useRef, useState } from "react";
import {
  SOCIAL_PLATFORMS,
  detectSocial,
} from "@/components/molecules/social-icon";
import { uploadImage } from "@/lib/api/uploads";
import {
  Button,
  Card,
  Icon,
  Input,
  RemoveIconButton,
  SectionLabel,
  Switch,
  Textarea,
} from "@/components/atoms";
import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Link2,
  PlayCircle,
  Plus,
  X,
} from "lucide-react";
import { FormField, OptionPicker } from "@/components/molecules";
import { EventTimelineItem, EventSocialLink } from "@/lib/event";
import {
  UpdateEventDetailData,
  EventDetailData,
  EventStageData,
} from "@/lib/zod/event";
import { useLookup } from "@/hooks/use-lookup";
import { getModes } from "@/lib/api/lookups";
import {
  HybridStagesField,
  fixedModeFor,
  newStage,
} from "./hybrid-stages-field";

function withAddedItem<T>(list: T[], item: T): T[] {
  return [...list, item];
}

function withUpdatedItem<T>(
  list: T[],
  index: number,
  updater: (item: T) => T,
): T[] {
  return list.map((item, itemIndex) =>
    itemIndex === index ? updater(item) : item,
  );
}

function withRemovedItem<T>(list: T[], index: number): T[] {
  return list.filter((_, itemIndex) => itemIndex !== index);
}

const inDay = (d: EventStageData, date: string) =>
  !!d.date &&
  date >= d.date &&
  date <= (d.endDate > d.date ? d.endDate : d.date);

export interface StepTimelineLinksProps {
  data: EventDetailData;
  onChange: UpdateEventDetailData;
  /** Which blocks to render — the edit page splits agenda from links/media. */
  parts?: ("timeline" | "links" | "media")[];
}

export function StepTimelineLinks({
  data,
  onChange,
  parts = ["timeline", "links", "media"],
}: StepTimelineLinksProps) {
  const show = (part: "timeline" | "links" | "media") => parts.includes(part);
  // Local UI-only toggle — doesn't touch stored data. Off = a plain ordered
  // title+description agenda with no date/time inputs shown at all.
  const [showTimes, setShowTimes] = useState(true);
  const { data: modes } = useLookup(getModes);
  const modeCode = modes.find((m) => m.id === data.mode)?.code ?? "";
  const splitDays = data.stages.length > 0;
  // Days switched off are kept for this session, so flipping back restores them.
  const parkedDays = useRef<EventStageData[]>([]);

  // Turning days on: one day per agenda date, consecutive dates that share a
  // day name merged into one range (semi-final slots → "Semi Final 9–16 Jan").
  function daysFromAgenda(): EventStageData[] {
    const fixed = fixedModeFor(modeCode);
    const dates = [
      ...new Set(data.timeline.map((t) => t.date).filter(Boolean)),
    ].sort();
    const days: EventStageData[] = [];
    for (const date of dates) {
      const items = data.timeline.filter((t) => t.date === date);
      const name =
        items.find((t) => t.dayLabel?.trim())?.dayLabel?.trim() ?? "";
      const prev = days[days.length - 1];
      if (prev && name && prev.label === name) {
        prev.endDate = date;
        continue;
      }
      const online = items.some((t) => /^online\b/i.test(t.location.trim()));
      const venue = items.some(
        (t) => t.location.trim() && !/^online\b/i.test(t.location.trim()),
      );
      const day = newStage(days.length + 1, undefined, fixed);
      days.push({
        ...day,
        label: name || `Day ${days.length + 1}`,
        date,
        time: items.find((t) => t.time)?.time ?? "",
        mode:
          fixed ??
          (online && venue
            ? "BOTH"
            : online
              ? "ONLINE"
              : venue
                ? "OFFLINE"
                : day.mode),
      });
    }
    return days.length ? days : [newStage(1, undefined, fixed)];
  }

  function toggleDays(on: boolean) {
    if (on) {
      onChange(
        "stages",
        parkedDays.current.length ? parkedDays.current : daysFromAgenda(),
      );
      if (!showTimes) setShowTimes(true);
    } else {
      parkedDays.current = data.stages;
      onChange("stages", []);
    }
  }

  // A day's name lives on every item of that date; new or moved items pick
  // up whatever their (new) day is already called.
  const dayLabelFor = (date: string) =>
    (date &&
      data.timeline.find((t) => t.date === date && t.dayLabel)?.dayLabel) ||
    "";

  function addTimelineItem() {
    const date = showTimes ? data.date || "" : "";
    onChange(
      "timeline",
      withAddedItem(data.timeline, {
        date,
        time: "",
        endTime: "",
        title: "",
        description: "",
        location: "",
        dayLabel: dayLabelFor(date),
      }),
    );
  }

  function updateTimelineItem(
    index: number,
    field: keyof EventTimelineItem,
    value: string,
  ) {
    onChange(
      "timeline",
      withUpdatedItem(data.timeline, index, (item) => ({
        ...item,
        [field]: value,
        ...(field === "date" ? { dayLabel: dayLabelFor(value) } : {}),
      })),
    );
  }

  function renameDay(date: string, label: string) {
    onChange(
      "timeline",
      data.timeline.map((item) =>
        item.date === date ? { ...item, dayLabel: label } : item,
      ),
    );
  }

  // Distinct dates, in date order — only a multi-day agenda shows day names.
  const agendaDays = [
    ...new Set(data.timeline.map((t) => t.date).filter(Boolean)),
  ].sort();

  function removeTimelineItem(index: number) {
    onChange("timeline", withRemovedItem(data.timeline, index));
  }

  // Swap two sessions by their place in the flat list (a day's sessions
  // needn't sit next to each other in it).
  function swapItems(a: number, b: number) {
    const next = [...data.timeline];
    [next[a], next[b]] = [next[b], next[a]];
    onChange("timeline", next);
  }

  function addSession(date: string) {
    onChange(
      "timeline",
      withAddedItem(data.timeline, {
        date,
        time: "",
        endTime: "",
        title: "",
        description: "",
        location: "",
        dayLabel: dayLabelFor(date),
      }),
    );
  }

  // Days change. Moving one day's start date carries its sessions with it.
  function changeDays(next: EventStageData[]) {
    const fixed = fixedModeFor(modeCode);
    if (fixed) next = next.map((d) => ({ ...d, mode: fixed }));
    const prev = data.stages;
    if (next.length === prev.length) {
      const moved = next
        .map((_, i) => i)
        .filter((i) => next[i].date !== prev[i].date);
      const i = moved[0];
      if (
        moved.length === 1 &&
        next[i].label === prev[i].label &&
        prev[i].date &&
        next[i].date
      ) {
        const delta = Date.parse(next[i].date) - Date.parse(prev[i].date);
        onChange(
          "timeline",
          data.timeline.map((t) =>
            t.date && inDay(prev[i], t.date)
              ? {
                  ...t,
                  date: new Date(Date.parse(t.date) + delta)
                    .toISOString()
                    .slice(0, 10),
                }
              : t,
          ),
        );
      }
    }
    onChange("stages", next);
  }

  const indexed = data.timeline.map((item, index) => ({ item, index }));
  const unplaced = indexed.filter(
    ({ item }) => !item.date || !data.stages.some((d) => inDay(d, item.date)),
  );

  // One session's fields. `date` — show the date input (limited to the
  // day's range when given); otherwise the date is the day's own.
  function sessionCard(
    { item, index }: { item: EventTimelineItem; index: number },
    o: {
      label: string;
      times: boolean;
      date: boolean;
      min?: string;
      max?: string;
      up?: number;
      down?: number;
    },
  ) {
    return (
      <Card key={index} className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-body text-text-primary font-semibold">{o.label}</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => o.up !== undefined && swapItems(index, o.up)}
              disabled={o.up === undefined}
              aria-label={`Move ${o.label} up`}
              className="text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Icon icon={ChevronUp} size="sm" />
            </button>
            <button
              type="button"
              onClick={() => o.down !== undefined && swapItems(index, o.down)}
              disabled={o.down === undefined}
              aria-label={`Move ${o.label} down`}
              className="text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Icon icon={ChevronDown} size="sm" />
            </button>
            <RemoveIconButton
              onClick={() => removeTimelineItem(index)}
              ariaLabel={`Remove ${o.label}`}
            />
          </div>
        </div>
        {o.times && (
          <div
            className={`grid gap-4 ${o.date ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
          >
            {o.date && (
              <FormField label="Date" htmlFor={`timeline-date-${index}`}>
                <Input
                  id={`timeline-date-${index}`}
                  type="date"
                  min={o.min}
                  max={o.max}
                  value={item.date}
                  onChange={(event) =>
                    updateTimelineItem(index, "date", event.target.value)
                  }
                />
              </FormField>
            )}
            <FormField label="Start" htmlFor={`timeline-time-${index}`}>
              <Input
                id={`timeline-time-${index}`}
                type="time"
                value={item.time}
                onChange={(event) =>
                  updateTimelineItem(index, "time", event.target.value)
                }
              />
            </FormField>
            <FormField label="End" htmlFor={`timeline-endtime-${index}`}>
              <Input
                id={`timeline-endtime-${index}`}
                type="time"
                value={item.endTime}
                onChange={(event) =>
                  updateTimelineItem(index, "endTime", event.target.value)
                }
              />
            </FormField>
          </div>
        )}
        <FormField label="Title" htmlFor={`timeline-title-${index}`}>
          <Input
            id={`timeline-title-${index}`}
            value={item.title}
            onChange={(event) =>
              updateTimelineItem(index, "title", event.target.value)
            }
            placeholder="e.g. Kickoff & Problem Statement"
          />
        </FormField>
        <FormField label="Location" htmlFor={`timeline-location-${index}`}>
          <Input
            id={`timeline-location-${index}`}
            value={item.location}
            onChange={(event) =>
              updateTimelineItem(index, "location", event.target.value)
            }
            placeholder="e.g. Main Hall (optional)"
          />
        </FormField>
        <FormField
          label="Description"
          htmlFor={`timeline-description-${index}`}
        >
          <Textarea
            id={`timeline-description-${index}`}
            value={item.description}
            onChange={(event) =>
              updateTimelineItem(index, "description", event.target.value)
            }
            placeholder="What happens in this slot?"
            rows={2}
          />
        </FormField>
      </Card>
    );
  }

  // Inside a day card: that day's sessions and an add row.
  function daySessions(day: EventStageData) {
    if (!day.date)
      return (
        <p className="text-small text-text-secondary">
          Set this day&apos;s date first — its sessions go on that date.
        </p>
      );
    const multi = day.endDate > day.date;
    const mine = indexed.filter(
      ({ item }) => item.date && inDay(day, item.date),
    );
    return (
      <div className="space-y-2">
        {mine.map((x, k) =>
          sessionCard(x, {
            label: `Session ${k + 1}`,
            times: true,
            date: multi,
            min: day.date,
            max: multi ? day.endDate : undefined,
            up: mine[k - 1]?.index,
            down: mine[k + 1]?.index,
          }),
        )}
        <button
          type="button"
          onClick={() => addSession(day.date)}
          className="border-border-light text-text-secondary hover:border-primary hover:text-primary hover:bg-primary-light/40 text-small flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 font-semibold transition-colors"
        >
          <Icon icon={Plus} size="sm" className="size-4" />
          {mine.length ? "Add session" : "Add the first session"}
        </button>
      </div>
    );
  }

  function addSocialLink() {
    onChange(
      "socialLinks",
      withAddedItem(data.socialLinks, { platform: "", url: "" }),
    );
  }

  function updateSocialLink(
    index: number,
    field: keyof EventSocialLink,
    value: string,
  ) {
    onChange(
      "socialLinks",
      withUpdatedItem(data.socialLinks, index, (link) => ({
        ...link,
        [field]: value,
      })),
    );
  }

  function removeSocialLink(index: number) {
    onChange("socialLinks", withRemovedItem(data.socialLinks, index));
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-large text-text-primary font-semibold">
          Timeline &amp; links
        </h2>
        <p className="text-body text-text-secondary">
          Optional — both help attendees know what to expect. Skip either if you
          don&apos;t need them.
        </p>
      </div>

      {show("timeline") && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>Timeline</SectionLabel>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Switch
                label="Split into days"
                checked={splitDays}
                onChange={(event) => toggleDays(event.target.checked)}
              />
              <Switch
                label="Show specific times"
                checked={showTimes}
                disabled={splitDays}
                onChange={(event) => {
                  const next = event.target.checked;
                  setShowTimes(next);
                  // Turning times off: clear any date/time already on existing
                  // items too, not just hide the inputs — otherwise a stale
                  // date silently produces a fake "00:00" timestamp on save.
                  if (!next) {
                    onChange(
                      "timeline",
                      data.timeline.map((item) => ({
                        ...item,
                        date: "",
                        time: "",
                        endTime: "",
                      })),
                    );
                  }
                }}
              />
            </div>
          </div>
          {splitDays && (
            <HybridStagesField
              stages={data.stages}
              venue={data.location}
              eventMode={modeCode}
              timeline={data.timeline}
              renderSessions={(day) => daySessions(day)}
              onChange={changeDays}
            />
          )}
          {!splitDays && (
            <p className="text-small text-text-secondary">
              Rounds on different dates, or online then at the venue? Turn on{" "}
              <strong className="text-text-primary">Split into days</strong> to
              give each its own dates, link or venue and button.
            </p>
          )}
          {!showTimes && (
            <p className="text-small text-text-secondary">
              Times are hidden — items show as a plain title &amp; description
              agenda, in the order below. Use the arrows to reorder.
            </p>
          )}
          {showTimes && !splitDays && agendaDays.length > 1 && (
            <div className="bg-bg-light border-border-light space-y-3 rounded-md border p-4">
              <div>
                <p className="text-body text-text-primary font-semibold">
                  Day names
                </p>
                <p className="text-small text-text-secondary">
                  Shown instead of &ldquo;Day 1&rdquo;, &ldquo;Day 2&rdquo; on
                  the event page, e.g. &ldquo;Online screening&rdquo; or
                  &ldquo;Finals&rdquo;. Leave blank to keep the number.
                </p>
              </div>
              <ul className="space-y-2">
                {agendaDays.map((date, i) => (
                  <li
                    key={date}
                    className="grid items-center gap-2 sm:grid-cols-[9rem_minmax(0,1fr)]"
                  >
                    <label
                      htmlFor={`day-label-${date}`}
                      className="text-small text-text-secondary font-medium"
                    >
                      {new Intl.DateTimeFormat("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      }).format(new Date(`${date}T00:00:00Z`))}
                    </label>
                    <Input
                      id={`day-label-${date}`}
                      value={dayLabelFor(date)}
                      onChange={(event) => renameDay(date, event.target.value)}
                      placeholder={`Day ${i + 1}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {splitDays ? (
            // sessions live inside their day; anything outside every day
            // stays editable here so it can be moved in
            unplaced.length > 0 && (
              <div className="border-warning/40 space-y-2 rounded-md border border-dashed p-3">
                <div>
                  <p className="text-body text-text-primary font-semibold">
                    Not in any day
                  </p>
                  <p className="text-small text-text-secondary">
                    Change a session&apos;s date to one inside a day, or remove
                    it.
                  </p>
                </div>
                {unplaced.map((x, k) =>
                  sessionCard(x, {
                    label: x.item.title.trim() || `Session ${k + 1}`,
                    times: true,
                    date: true,
                    up: unplaced[k - 1]?.index,
                    down: unplaced[k + 1]?.index,
                  }),
                )}
              </div>
            )
          ) : (
            <>
              {indexed.map((x, i) =>
                sessionCard(x, {
                  label: `Item ${i + 1}`,
                  times: showTimes,
                  date: showTimes,
                  up: i > 0 ? i - 1 : undefined,
                  down: i < indexed.length - 1 ? i + 1 : undefined,
                }),
              )}
              {/* add sits where the next item will appear */}
              <button
                type="button"
                onClick={addTimelineItem}
                className="border-border-light text-text-secondary hover:border-primary hover:text-primary hover:bg-primary-light/40 text-small flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 font-semibold transition-colors"
              >
                <Icon icon={Plus} size="sm" className="size-4" />
                {data.timeline.length
                  ? "Add timeline item"
                  : "Add the first timeline item"}
              </button>
            </>
          )}
        </div>
      )}

      {show("links") && (
        <div
          className={`space-y-3 ${show("timeline") ? "border-border-light border-t pt-6" : ""}`}
        >
          <SectionLabel>Social links</SectionLabel>
          {data.socialLinks.map((link, index) => (
            <Card key={index} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <SocialLinkTitle link={link} index={index} />
                <RemoveIconButton
                  onClick={() => removeSocialLink(index)}
                  ariaLabel={`Remove social link ${index + 1}`}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="Platform"
                  htmlFor={`social-platform-${index}`}
                >
                  <OptionPicker
                    id={`social-platform-${index}`}
                    value={link.platform}
                    onChange={(value) =>
                      updateSocialLink(index, "platform", value)
                    }
                    placeholder="Choose a platform"
                    options={SOCIAL_PLATFORM_OPTIONS}
                    customLabel="Other…"
                    customPlaceholder="e.g. Meetup, Luma"
                  />
                </FormField>
                <FormField label="URL" htmlFor={`social-url-${index}`}>
                  <Input
                    id={`social-url-${index}`}
                    type="url"
                    value={link.url}
                    onChange={(event) =>
                      updateSocialLink(index, "url", event.target.value)
                    }
                    placeholder={urlPlaceholder(link.platform)}
                  />
                </FormField>
              </div>
            </Card>
          ))}
          <Button variant="secondary" size="sm" onClick={addSocialLink}>
            + Add link
          </Button>
        </div>
      )}

      {show("media") && (
        <MediaEditor
          urls={data.mediaUrls}
          onChange={(urls) => onChange("mediaUrls", urls)}
          divided={show("timeline") || show("links")}
        />
      )}
    </div>
  );
}

// Link card title: the detected platform's logo + name once filled in.
function SocialLinkTitle({
  link,
  index,
}: {
  link: { platform: string; url: string };
  index: number;
}) {
  const filled = link.platform.trim() || link.url.trim();
  const brand = detectSocial(link.platform, link.url);
  const Logo = brand.icon;
  return (
    <p className="text-body text-text-primary flex items-center gap-2 font-semibold">
      <span
        style={{ color: filled ? brand.color : undefined }}
        className="bg-bg-light text-text-secondary flex size-7 items-center justify-center rounded-full"
      >
        <Logo className="size-4" />
      </span>
      {filled ? brand.label : `Link ${index + 1}`}
    </p>
  );
}

const SOCIAL_PLATFORM_OPTIONS = SOCIAL_PLATFORMS.map((b) => {
  const Logo = b.icon;
  return {
    value: b.label,
    label: b.label,
    icon: <Logo className="size-4" style={{ color: b.color }} />,
  };
});

const URL_HINTS: Record<string, string> = {
  "X (Twitter)": "https://x.com/yourhandle",
  LinkedIn: "https://linkedin.com/company/…",
  Instagram: "https://instagram.com/yourhandle",
  YouTube: "https://youtube.com/@yourchannel",
  GitHub: "https://github.com/…",
  Discord: "https://discord.gg/…",
  WhatsApp: "https://chat.whatsapp.com/…",
  Telegram: "https://t.me/…",
  Facebook: "https://facebook.com/…",
};
const urlPlaceholder = (platform: string) => URL_HINTS[platform] ?? "https://…";

const YT =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i;

// Photos (uploaded from the device) and videos / image links for the event
// page gallery. Uploads are downscaled in the browser, stored in object
// storage by /api/v1/uploads/image, and only the returned URL is kept.
function MediaEditor({
  urls,
  onChange,
  divided,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  divided: boolean;
}) {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const items = urls.filter((u) => u.trim() !== "");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const added: string[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      try {
        added.push(await uploadImage(file, "gallery"));
      } catch (err) {
        problems.push(err instanceof Error ? err.message : "Upload failed.");
      }
    }
    setBusy(false);
    if (added.length) onChange([...items, ...added]);
    if (problems.length) setError(problems.join(" "));
  }

  function addLink() {
    const url = link.trim();
    if (!/^https?:\/\//i.test(url)) {
      setError("Links start with https://");
      return;
    }
    setError(null);
    onChange([...items, url]);
    setLink("");
  }

  return (
    <div
      className={`space-y-4 ${divided ? "border-border-light border-t pt-6" : ""}`}
    >
      <div>
        <SectionLabel>Photos &amp; videos</SectionLabel>
        <p className="text-small text-text-secondary">
          Shown as a gallery on the event page. Upload photos, or paste a
          YouTube or image link.
        </p>
      </div>

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((url, i) => {
            const yt = url.match(YT)?.[1];
            const image = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(url);
            return (
              <li
                key={`${i}-${url.slice(0, 32)}`}
                className="border-border-light bg-bg-light group relative aspect-video overflow-hidden rounded-md border"
              >
                {yt || image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : url
                    }
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-text-secondary flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-xs">
                    <Icon icon={Link2} size="sm" />
                    <span className="line-clamp-2 break-all">{url}</span>
                  </span>
                )}
                {yt && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Icon
                      icon={PlayCircle}
                      size="lg"
                      className="text-white drop-shadow"
                    />
                  </span>
                )}
                <span className="absolute bottom-1 left-1 rounded-sm bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {yt ? "Video" : image ? "Image link" : "Link"}
                </span>
                <button
                  type="button"
                  aria-label={`Remove media ${i + 1}`}
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <Icon icon={X} size="sm" className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="border-border-light text-text-secondary hover:border-border-hover hover:text-text-primary flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed py-5 transition-colors disabled:opacity-60"
      >
        <Icon icon={ImagePlus} size="md" />
        <span className="text-small font-semibold">
          {busy ? "Uploading photos…" : "Upload photos"}
        </span>
        <span className="text-xs">
          JPG, PNG, WebP or GIF · several at once · 10 MB each · 16:9 looks best
        </span>
      </button>

      <div className="flex gap-2">
        <Input
          aria-label="YouTube or image link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addLink();
            }
          }}
          placeholder="Paste a YouTube or image link"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={addLink}
          disabled={!link.trim()}
        >
          Add
        </Button>
      </div>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
