"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  X,
} from "lucide-react";
import { Icon } from "@/components/atoms";
import type { Event } from "@/lib/event";

// Organizer media as a compact mosaic: photos and videos share one grid
// (first item featured, "+N" when there's more), clicking opens a viewer
// with arrows/keys; videos only load a player inside the viewer. Other
// links (slides, docs) sit underneath as file chips.

type Visual =
  | { kind: "video"; url: string; videoId: string }
  | { kind: "image"; url: string };
type FileLink = { url: string; name: string; host: string; ext: string };

function youTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i,
  );
  return m ? m[1] : null;
}

function isImage(url: string) {
  return (
    /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(url) ||
    url.startsWith("/images/") ||
    url.startsWith("data:image") ||
    url.startsWith("blob:")
  );
}

function split(urls: string[]) {
  const visuals: Visual[] = [];
  const files: FileLink[] = [];
  for (const url of urls.map((u) => u.trim()).filter(Boolean)) {
    const videoId = youTubeId(url);
    if (videoId) visuals.push({ kind: "video", url, videoId });
    else if (isImage(url)) visuals.push({ kind: "image", url });
    else {
      let host = "";
      let name = url;
      try {
        const u = new URL(url);
        host = u.host.replace(/^www\./, "");
        name = decodeURIComponent(
          u.pathname.split("/").filter(Boolean).pop() ?? host,
        );
      } catch {
        // not a full URL — show as typed
      }
      const ext = name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toUpperCase() ?? "";
      files.push({ url, name, host, ext });
    }
  }
  return { visuals, files };
}

const thumb = (v: Visual) =>
  v.kind === "video"
    ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
    : v.url;

// Mosaic slot classes for the first five tiles, by how many there are.
function tileClass(count: number, index: number): string {
  if (count === 1) return "col-span-4 row-span-2";
  if (count === 2) return "col-span-2 row-span-2";
  if (index === 0) return "col-span-2 row-span-2";
  if (count === 3) return "col-span-2";
  if (count === 4) return index === 1 ? "col-span-2" : "";
  return "";
}

// File-type badge colours — PDF gets the familiar red.
const EXT_TONE: Record<string, string> = {
  PDF: "bg-[#E5252A]",
  DOC: "bg-[#2B579A]",
  DOCX: "bg-[#2B579A]",
  PPT: "bg-[#D24726]",
  PPTX: "bg-[#D24726]",
  XLS: "bg-[#217346]",
  XLSX: "bg-[#217346]",
};

type Tile =
  | { kind: "visual"; v: Visual; vi: number }
  | { kind: "file"; f: FileLink };

export function MediaSection({ event }: { event: Event }) {
  const { visuals, files } = split(event.mediaUrls ?? []);
  const [open, setOpen] = useState<number | null>(null);
  if (visuals.length === 0 && files.length === 0) return null;

  // Photos/videos first, then files — all one mosaic.
  const tiles: Tile[] = [
    ...visuals.map((v, vi) => ({ kind: "visual" as const, v, vi })),
    ...files.map((f) => ({ kind: "file" as const, f })),
  ];
  const shown = tiles.slice(0, 5);
  const extra = tiles.length - shown.length;
  const photos = visuals.filter((v) => v.kind === "image").length;
  const videos = visuals.length - photos;
  const tileBase =
    "group bg-bg-light focus-visible:ring-primary relative overflow-hidden rounded-md focus-visible:ring-2 focus-visible:outline-none";

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-text-primary text-xl font-bold">Media</h2>
        <span className="text-small text-text-secondary">
          {[
            photos && `${photos} photo${photos === 1 ? "" : "s"}`,
            videos && `${videos} video${videos === 1 ? "" : "s"}`,
            files.length &&
              `${files.length} file${files.length === 1 ? "" : "s"}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>

      <div
        className={`grid grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-lg ${shown.length === 1 ? "aspect-video" : "aspect-[2/1]"}`}
      >
        {shown.map((t, i) => {
          const slot = tileClass(shown.length, i);
          const isLast = i === shown.length - 1 && extra > 0;

          if (t.kind === "file" && !isLast) {
            const tone = EXT_TONE[t.f.ext] ?? "bg-primary";
            return (
              <a
                key={t.f.url}
                href={t.f.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${t.f.name}`}
                className={`${tileBase} border-border-light bg-surface-light hover:border-border-hover flex flex-col items-center justify-center gap-2 border p-3 text-center transition-colors ${slot}`}
              >
                <DocIcon
                  label={t.f.ext || "LINK"}
                  tone={tone}
                  large={i === 0}
                />
                <span className="w-full min-w-0">
                  <span className="text-text-primary line-clamp-2 block text-xs font-semibold break-all">
                    {t.f.name}
                  </span>
                  {t.f.host && (
                    <span className="text-text-secondary mt-0.5 block truncate text-[11px]">
                      {t.f.host}
                    </span>
                  )}
                </span>
              </a>
            );
          }

          const v = t.kind === "visual" ? t.v : undefined;
          return (
            <button
              key={t.kind === "visual" ? t.v.url : t.f.url}
              type="button"
              onClick={() => setOpen(t.kind === "visual" ? t.vi : 0)}
              aria-label={
                isLast
                  ? `View all ${tiles.length} items`
                  : v?.kind === "video"
                    ? "Play video"
                    : `View photo ${i + 1}`
              }
              className={`${tileBase} ${slot}`}
            >
              {v ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb(v)}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              ) : (
                <span className="bg-surface-light absolute inset-0 flex items-center justify-center">
                  <DocIcon label="FILE" tone="bg-primary" />
                </span>
              )}
              <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
              {v?.kind === "video" && !isLast && (
                <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/45 via-black/5 to-transparent">
                  <span
                    className={`flex items-center justify-center rounded-full bg-white/95 text-black shadow-lg transition-transform group-hover:scale-105 ${i === 0 ? "size-14" : "size-10"}`}
                  >
                    <Icon
                      icon={Play}
                      size="sm"
                      className={`translate-x-px fill-current ${i === 0 ? "size-6" : "size-4"}`}
                    />
                  </span>
                </span>
              )}
              {isLast && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-bold text-white">
                  +{extra + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {open !== null && visuals.length > 0 && (
        <Lightbox
          items={visuals}
          index={open}
          title={event.title}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

// A page with a folded corner and a coloured type badge, so it reads as
// "a PDF" (or DOC, PPT…) at a glance.
function DocIcon({
  label,
  tone,
  large = false,
}: {
  label: string;
  tone: string;
  large?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`relative block shrink-0 ${large ? "h-24 w-[4.75rem]" : "h-14 w-11"}`}
    >
      <svg
        viewBox="0 0 38 48"
        className="absolute inset-0 h-full w-full drop-shadow-sm"
      >
        <path
          d="M4 1h21l12 12v30a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4Z"
          fill="#ffffff"
          stroke="var(--color-border-hover)"
          strokeWidth="1.2"
        />
        <path
          d="M25 1v8a4 4 0 0 0 4 4h8"
          fill="var(--color-bg-light)"
          stroke="var(--color-border-hover)"
          strokeWidth="1.2"
        />
        <path
          d="M8 21h18M8 26h22M8 31h14"
          stroke="var(--color-border-light)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span
        className={`absolute -left-1.5 rounded-[3px] font-extrabold tracking-wide text-white shadow-sm ${tone} ${large ? "bottom-4 px-2 py-0.5 text-xs" : "bottom-2 px-1 text-[9px]"}`}
      >
        {label}
      </span>
    </span>
  );
}

function Lightbox({
  items,
  index,
  title,
  onIndex,
  onClose,
}: {
  items: Visual[];
  index: number;
  title: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const go = useCallback(
    (step: number) => onIndex((index + step + items.length) % items.length),
    [index, items.length, onIndex],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const item = items[index];
  const many = items.length > 1;
  const nav =
    "absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} media`}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgb(8_12_20/0.94)] p-4 backdrop-blur-md sm:p-10"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-5xl items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {item.kind === "video" ? (
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black shadow-2xl">
            <iframe
              key={item.videoId}
              src={`https://www.youtube-nocookie.com/embed/${item.videoId}?autoplay=1&rel=0`}
              title={`${title} video`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={`${title} photo`}
            className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
          />
        )}
      </div>

      {many && (
        <>
          <button
            type="button"
            aria-label="Previous"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className={`${nav} left-3 sm:left-6`}
          >
            <Icon icon={ChevronLeft} size="md" />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className={`${nav} right-3 sm:right-6`}
          >
            <Icon icon={ChevronRight} size="md" />
          </button>
        </>
      )}

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 text-white">
        <span className="text-small font-medium text-white/80">
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
        >
          <Icon icon={X} size="sm" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
