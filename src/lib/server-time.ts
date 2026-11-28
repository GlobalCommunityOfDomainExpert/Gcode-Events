import { withBasePath } from "@/lib/base-path";
let offsetMs = 0;
let syncPromise: Promise<void> | null = null;

async function syncServerTime(): Promise<void> {
  try {
    const res = await fetch(withBasePath("/api/server-time"));
    const { now } = await res.json();
    offsetMs = new Date(now).getTime() - Date.now();
  } catch {
    // network hiccup — keep offset at 0 (falls back to local clock) rather
    // than blocking rendering; corrected on the next successful sync.
  }
}

export function ensureServerTimeSynced(): Promise<void> {
  if (!syncPromise) syncPromise = syncServerTime();
  return syncPromise;
}

export function serverNow(): Date {
  return new Date(Date.now() + offsetMs);
}
