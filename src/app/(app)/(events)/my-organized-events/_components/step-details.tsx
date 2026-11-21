import { useRef } from "react";
import { ImageIcon, Upload, X } from "lucide-react";
import { Button, Icon, Input } from "@/components/atoms";
import { Chip, FormField } from "@/components/molecules";
import { RichTextEditor } from "@/components/molecules/rich-text-editor";
import { UpdateEventDetailData, EventDetailData } from "@/lib/zod/event";
import { useLookup } from "@/hooks/use-lookup";
import { getCategories } from "@/lib/api/lookups";

export interface StepDetailsProps {
  data: EventDetailData;
  onChange: UpdateEventDetailData;
  /** The edit page shows categories on its "Type & tags" tab instead. */
  showCategories?: boolean;
}

export function StepDetails({
  data,
  onChange,
  showCategories = true,
}: StepDetailsProps) {
  // blob: previews are revoked when replaced/removed so they don't leak.
  function setImage(key: "coverImageUrl" | "cardImageUrl", file: File | null) {
    const prev = data[key];
    if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
    onChange(key, file ? URL.createObjectURL(file) : "");
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-large text-text-primary font-semibold">
          Tell us about the event
        </h2>
        <p className="text-body text-text-secondary">
          This shows up on the event&apos;s public page.
        </p>
      </div>

      <ImageField
        id="event-cover-image"
        label="Cover image"
        size="1800 × 600 px"
        ratio="3:1"
        hint="Wide banner at the top of the event page. Keep text and logos in the middle. Leave blank for an auto-generated colour."
        url={data.coverImageUrl}
        onPick={(f) => setImage("coverImageUrl", f)}
        frames={[{ label: "Event page", className: "aspect-3/1" }]}
      />

      <ImageField
        id="event-card-image"
        label="Card image"
        size="1600 × 700 px"
        ratio="16:7"
        hint="Shown whole on event cards and at the top of the event page on phones, where the 3:1 cover is too small to read. Cards put the type and price badges over the top-left corner, so keep that corner free of text."
        url={data.cardImageUrl}
        fallbackUrl={data.coverImageUrl}
        fallbackNote="Using your cover image until you add one — a 3:1 cover loses its sides in a 16:7 frame."
        onPick={(f) => setImage("cardImageUrl", f)}
        frames={[
          {
            label: "Event card · phone event page",
            className: "aspect-[16/7]",
          },
        ]}
      />

      <FormField label="Event Title" htmlFor="event-title" required>
        <Input
          id="event-title"
          value={data.title}
          onChange={(event) => onChange("title", event.target.value)}
          placeholder="e.g. GCODE Build Sprint · Winter 2026"
        />
      </FormField>

      <FormField
        label="Summary"
        htmlFor="event-summary"
        hint={`One line under the title and on event cards · ${data.summary.length}/200`}
      >
        <Input
          id="event-summary"
          value={data.summary}
          maxLength={200}
          onChange={(event) => onChange("summary", event.target.value)}
          placeholder="e.g. An all-night build sprint — ship a prototype before sunrise."
        />
      </FormField>

      <FormField
        label="Description"
        htmlFor="event-description"
        required
        hint="Select text to make it bold, italic or underlined, or start a line with a bullet. Each line becomes its own paragraph."
      >
        <RichTextEditor
          id="event-description"
          value={data.description}
          onChange={(value) => onChange("description", value)}
          placeholder="Describe the event, who it's for, and what attendees will get out of it..."
          rows={6}
        />
      </FormField>

      {showCategories && <CategoryField data={data} onChange={onChange} />}
    </div>
  );
}

export function CategoryField({
  data,
  onChange,
  hint = "Helps people find the event when filtering.",
}: {
  data: EventDetailData;
  onChange: UpdateEventDetailData;
  hint?: string;
}) {
  const { data: categories } = useLookup(getCategories);

  function toggleCategory(id: number) {
    const next = data.categoryIds.includes(id)
      ? data.categoryIds.filter((c) => c !== id)
      : [...data.categoryIds, id];
    onChange("categoryIds", next);
  }

  return (
    <FormField label="Category Tags" htmlFor="event-categories" hint={hint}>
      <div id="event-categories" className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <Chip
            key={category.id}
            selected={data.categoryIds.includes(category.id)}
            onClick={() => toggleCategory(category.id)}
          >
            {category.name}
          </Chip>
        ))}
      </div>
    </FormField>
  );
}

// Image picker that states the size/ratio up front and previews the image in
// every frame it will be cropped to, so organizers see the trim before saving.
function ImageField({
  id,
  label,
  size,
  ratio,
  hint,
  url,
  fallbackUrl,
  fallbackNote,
  onPick,
  frames,
}: {
  id: string;
  label: string;
  size: string;
  ratio: string;
  hint: string;
  url: string;
  /** Shown faded in the frames when `url` is empty (e.g. the cover). */
  fallbackUrl?: string;
  fallbackNote?: string;
  onPick: (file: File | null) => void;
  frames: { label: string; className: string }[];
}) {
  const ref = useRef<HTMLInputElement>(null);
  const shown = url || fallbackUrl || "";
  const usingFallback = !url && !!fallbackUrl;

  return (
    <FormField label={label} htmlFor={id}>
      <input
        ref={ref}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="bg-bg-light text-text-primary rounded-sm px-2 py-0.5 text-xs font-bold tabular-nums">
            {ratio}
          </span>
          <span className="text-text-secondary text-xs tabular-nums">
            {size} · JPG, PNG or WebP
          </span>
        </div>
        <p className="text-text-secondary text-xs">{hint}</p>

        {shown ? (
          <div
            className={`grid gap-3 ${frames.length > 1 ? "sm:grid-cols-2" : ""}`}
          >
            {frames.map((f) => (
              <figure key={f.label} className="space-y-1">
                <div
                  className={`border-border-light relative w-full overflow-hidden rounded-md border ${f.className} ${frames.length === 1 ? "max-w-md" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shown}
                    alt={`${label} preview — ${f.label}`}
                    className={`h-full w-full object-cover ${usingFallback ? "opacity-60" : ""}`}
                  />
                </div>
                <figcaption className="text-text-secondary text-xs">
                  {f.label}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className={`border-border-light text-text-secondary hover:border-border-hover hover:text-text-primary flex w-full max-w-md flex-col items-center justify-center gap-1 rounded-md border border-dashed ${frames[0].className}`}
          >
            <Icon icon={ImageIcon} size="md" />
            <span className="text-small font-semibold">Choose image</span>
            <span className="text-xs">
              {ratio} · {size}
            </span>
          </button>
        )}

        {usingFallback && fallbackNote && (
          <p className="text-text-secondary text-xs">{fallbackNote}</p>
        )}

        {shown && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => ref.current?.click()}
            >
              <Icon icon={Upload} size="sm" /> {url ? "Replace" : "Upload"}{" "}
              {label.toLowerCase()}
            </Button>
            {url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onPick(null)}
              >
                <Icon icon={X} size="sm" /> Remove
              </Button>
            )}
          </div>
        )}
      </div>
    </FormField>
  );
}
