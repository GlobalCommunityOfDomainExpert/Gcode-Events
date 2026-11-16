"use client";

import { useState } from "react";
import {
  SOCIAL_PLATFORMS,
  detectSocial,
} from "@/components/molecules/social-icon";
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
import { ChevronDown, ChevronUp, Link2, PlayCircle, X } from "lucide-react";
import { FormField, OptionPicker } from "@/components/molecules";
import { EventTimelineItem, EventSocialLink } from "@/lib/event";
import { UpdateEventDetailData, EventDetailData } from "@/lib/zod/event";

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

// Swaps item at `index` with its neighbor in the given direction. Order here
// becomes EVENT_TIMELINE.sort_order on save, so this is how organizers
// control display order for a plain title+description agenda.
function withMovedItem<T>(
  list: T[],
  index: number,
  direction: "up" | "down",
): T[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

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

  function moveTimelineItem(index: number, direction: "up" | "down") {
    onChange("timeline", withMovedItem(data.timeline, index, direction));
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
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>Timeline</SectionLabel>
            <Switch
              label="Show specific times"
              checked={showTimes}
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
          {!showTimes && (
            <p className="text-small text-text-secondary">
              Times are hidden — items show as a plain title &amp; description
              agenda, in the order below. Use the arrows to reorder.
            </p>
          )}
          {showTimes && agendaDays.length > 1 && (
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
          {data.timeline.map((item, index) => (
            <Card key={index} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-body text-text-primary font-semibold">
                  Item {index + 1}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveTimelineItem(index, "up")}
                    disabled={index === 0}
                    aria-label={`Move timeline item ${index + 1} up`}
                    className="text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Icon icon={ChevronUp} size="sm" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTimelineItem(index, "down")}
                    disabled={index === data.timeline.length - 1}
                    aria-label={`Move timeline item ${index + 1} down`}
                    className="text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Icon icon={ChevronDown} size="sm" />
                  </button>
                  <RemoveIconButton
                    onClick={() => removeTimelineItem(index)}
                    ariaLabel={`Remove timeline item ${index + 1}`}
                  />
                </div>
              </div>
              {showTimes && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField label="Date" htmlFor={`timeline-date-${index}`}>
                    <Input
                      id={`timeline-date-${index}`}
                      type="date"
                      value={item.date}
                      onChange={(event) =>
                        updateTimelineItem(index, "date", event.target.value)
                      }
                    />
                  </FormField>
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
              <FormField
                label="Location"
                htmlFor={`timeline-location-${index}`}
              >
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
          ))}
          <Button variant="secondary" size="sm" onClick={addTimelineItem}>
            + Add timeline item
          </Button>
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

// Photos and videos for the event page gallery: YouTube or image links only.
// Device upload is added once the backend upload endpoint is live (handover 4, D1).
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
  const items = urls.filter((u) => u.trim() !== "");

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
          Shown as a gallery on the event page. Paste a YouTube or image link.
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
