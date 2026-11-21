// Shared display helpers: IST date/time formatting, image URLs, and small
// parsers used by several adapters.

import { IST } from "@/lib/datetime/ist";

// Cover/banner URLs may be an absolute URL, a same-origin path (our own
// /api/v1 image route, /images/ static assets), a local preview, or the
// legacy stored path for a database-held cover.
export function resolveImageUrl(url: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;
  // Local previews (editor cover picker) — already loadable as-is.
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  // Same-origin: our API routes and static assets bundled in /public.
  if (url.startsWith("/api/") || url.startsWith("/images/")) return url;
  const dbCover = url.match(/^\/events\/(\d+)\/cover-image-file$/);
  if (dbCover) return `/api/v1/events/${dbCover[1]}/cover-image`;
  // Anything else isn't loadable — show the placeholder.
  return undefined;
}

// Organizer text is stored newline-separated (like DESCRIPTION); split into
// bullet lines, falling back to the defaults above when blank/unset.
export function splitBullets(raw: string | null, fallback: string[]): string[] {
  if (!raw) return fallback;
  const lines = raw.split("\n").filter((line) => line.trim() !== "");
  return lines.length > 0 ? lines : fallback;
}

// JSON_ARRAYAGG columns arrive as a JSON-array-shaped string (or null when
// the event has no categories) rather than a real array.
export function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export function formatDate(iso: string | null): string {
  if (!iso) return "Coming Soon";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: IST,
  }).format(new Date(iso));
}

export function formatTime(iso: string | null): string {
  if (!iso) return "";
  return `${new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: IST,
  }).format(new Date(iso))} IST`;
}

export function resolveLocation(city: string, address: string | null): string {
  if (address && address !== "TBD") return `${address}, ${city}`;
  return city;
}

// Human duration between two ISO timestamps, e.g. "3h 30m", "2 days".
export function formatDuration(
  start: string | null,
  end: string | null,
): string {
  if (!start || !end) return "";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const mins = Math.round(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  if (days > 0)
    return `${days} day${days > 1 ? "s" : ""}${hours ? ` ${hours}h` : ""}`;
  if (hours > 0) return `${hours}h${rem ? ` ${rem}m` : ""}`;
  return `${rem}m`;
}
