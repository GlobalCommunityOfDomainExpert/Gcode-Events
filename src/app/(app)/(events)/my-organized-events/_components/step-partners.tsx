"use client";

import {
  ArrowDown,
  ArrowUp,
  ImageIcon,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { uploadImage } from "@/lib/api/uploads";
import { Icon, Input } from "@/components/atoms";
import {
  FormField,
  OptionPicker,
  type PickerOption,
} from "@/components/molecules";
import {
  EventDetailData,
  EventPartnerData,
  UpdateEventDetailData,
} from "@/lib/zod/event";

// How each brand is introduced on the event page. Free text — these are
// just the usual ones.
const ROLES: PickerOption[] = [
  {
    value: "Presented by",
    label: "Presented by",
    hint: "Whose event it is — use for the lead",
  },
  { value: "Hosted by", label: "Hosted by", hint: "Venue or host running it" },
  {
    value: "Powered by",
    label: "Powered by",
    hint: "Platform behind it, e.g. GCODE",
  },
  { value: "In association with", label: "In association with" },
  { value: "Venue partner", label: "Venue partner" },
  { value: "Sponsored by", label: "Sponsored by" },
  { value: "Community partner", label: "Community partner" },
  { value: "Media partner", label: "Media partner" },
];

const blank = (): EventPartnerData => ({
  name: "",
  role: "In association with",
  logoUrl: "",
  url: "",
  about: "",
});

// Co-branding: brands shown next to the organizer on the event page
// ("Powered by GCODE · In association with KAY KOY").
export function StepPartners({
  data,
  onChange,
}: {
  data: EventDetailData;
  onChange: UpdateEventDetailData;
}) {
  const list = data.partners;
  const set = (next: EventPartnerData[]) => onChange("partners", next);
  const patch = (i: number, p: Partial<EventPartnerData>) =>
    set(list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set(next);
  };

  return (
    <div className="space-y-5">
      <p className="text-small text-text-secondary">
        Brands you&apos;re running this event with, in the order shown under the
        title.{" "}
        <strong className="text-text-primary">The first one is the lead</strong>{" "}
        — shown biggest and as &ldquo;Presented by&rdquo; in the host card, so
        put whoever the event belongs to first.
      </p>

      {list.length === 0 && (
        <p className="border-border-light text-small text-text-secondary rounded-md border border-dashed px-4 py-6 text-center">
          No partners yet. The event page shows only your name as host.
        </p>
      )}

      <ol className="space-y-3">
        {list.map((p, i) => (
          <li
            key={i}
            className="border-border-light bg-surface-light space-y-3 rounded-md border p-4"
          >
            <div className="flex items-start gap-4">
              <LogoTile
                url={p.logoUrl}
                name={p.name}
                onChange={(logoUrl) => patch(i, { logoUrl })}
              />
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                <FormField label="Shown as" htmlFor={`partner-role-${i}`}>
                  <OptionPicker
                    id={`partner-role-${i}`}
                    value={p.role}
                    onChange={(role) => patch(i, { role })}
                    options={ROLES}
                    customLabel="Write your own…"
                    customPlaceholder="e.g. Organised with"
                  />
                </FormField>
                <FormField label="Brand name" htmlFor={`partner-name-${i}`}>
                  <Input
                    id={`partner-name-${i}`}
                    value={p.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                    placeholder="KAY KOY"
                  />
                </FormField>
                {i === 0 && (
                  <div className="sm:col-span-2">
                    <FormField
                      label="About them (lead only)"
                      htmlFor="partner-about"
                      hint={`One line for the host card · ${p.about.length}/140`}
                    >
                      <Input
                        id="partner-about"
                        maxLength={140}
                        value={p.about}
                        onChange={(e) => patch(i, { about: e.target.value })}
                        placeholder="e.g. Sarjapur venue hosting the live rounds"
                      />
                    </FormField>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <FormField
                    label="Logo link (optional)"
                    htmlFor={`partner-logo-${i}`}
                    hint="Link to a PNG with a transparent background. Without one the brand name is shown."
                  >
                    <Input
                      id={`partner-logo-${i}`}
                      type="url"
                      value={p.logoUrl}
                      onChange={(e) => patch(i, { logoUrl: e.target.value })}
                      placeholder="https://…/logo.png"
                    />
                  </FormField>
                </div>
                <div className="sm:col-span-2">
                  <FormField
                    label="Link (optional)"
                    htmlFor={`partner-url-${i}`}
                  >
                    <Input
                      id={`partner-url-${i}`}
                      type="url"
                      value={p.url}
                      onChange={(e) => patch(i, { url: e.target.value })}
                      placeholder="https://"
                    />
                  </FormField>
                </div>
              </div>
            </div>
            <div className="border-border-light flex items-center gap-1 border-t pt-2">
              {!p.name.trim() && (
                <span className="text-warning mr-auto text-xs font-medium">
                  Add the brand name — partners without one aren&apos;t shown.
                </span>
              )}
              <span className="ml-auto flex items-center gap-0.5">
                <Btn
                  icon={ArrowUp}
                  label="Move up"
                  onClick={i > 0 ? () => move(i, -1) : undefined}
                />
                <Btn
                  icon={ArrowDown}
                  label="Move down"
                  onClick={i < list.length - 1 ? () => move(i, 1) : undefined}
                />
                <Btn
                  icon={Trash2}
                  label="Remove partner"
                  onClick={() => set(list.filter((_, j) => j !== i))}
                />
              </span>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => set([...list, blank()])}
        className="border-border-light text-text-secondary hover:border-border-hover hover:text-text-primary flex w-full items-center justify-center gap-2 rounded-md border border-dashed py-2.5 text-sm font-semibold transition-colors"
      >
        <Icon icon={Plus} size="sm" className="size-4" /> Add partner
      </button>

      <p className="text-text-secondary text-xs">
        Logos: PNG with a transparent background, at least 200 px tall. Square
        or wide both work — they&apos;re shown on white, fitted into a small
        tile.
      </p>
    </div>
  );
}

// Logo preview that doubles as the upload button. The file is downscaled in
// the browser, stored via /api/uploads/image, and only the URL is kept (a
// pasted link works too, in the field beside it).
function LogoTile({
  url,
  name,
  onChange,
}: {
  url: string;
  name: string;
  onChange: (url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onChange(await uploadImage(file, "logo"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-20 shrink-0 flex-col items-center gap-1">
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        aria-label={url ? `Change ${name || "partner"} logo` : "Upload logo"}
        className="border-border-light hover:border-border-hover flex size-20 items-center justify-center overflow-hidden rounded-md border bg-white p-2 disabled:opacity-60"
      >
        {busy ? (
          <span className="text-text-secondary text-[11px] font-semibold">
            Uploading…
          </span>
        ) : url.trim() ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-text-secondary flex flex-col items-center gap-1 text-[11px] font-semibold">
            <Icon icon={ImageIcon} size="sm" /> Upload
          </span>
        )}
      </button>
      {url && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-text-secondary hover:text-danger text-xs"
        >
          Remove
        </button>
      )}
      {error && (
        <p role="alert" className="text-danger text-center text-[11px]">
          {error}
        </p>
      )}
    </div>
  );
}

function Btn({
  icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!onClick}
      onClick={onClick}
      className="text-text-secondary hover:bg-bg-light hover:text-text-primary rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Icon icon={icon} size="sm" className="size-4" />
    </button>
  );
}
