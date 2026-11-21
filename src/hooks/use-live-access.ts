"use client";

import { useEffect, useState } from "react";
import { getLiveAccess, type LiveAccess } from "@/lib/api/webinar";

/**
 * The viewer's door state for an event's live room, from the server (never
 * from the URL or the browser clock). `undefined` while loading, `null` when
 * it can't be read, which callers treat as "no ticket". Polls so a page left
 * open moves from "opens in 5 min" to "Join now" by itself.
 */
export function useLiveAccess(
  eventId: string | undefined,
  enabled: boolean,
): LiveAccess | null | undefined {
  const [access, setAccess] = useState<LiveAccess | null>();

  useEffect(() => {
    if (!eventId || !enabled) return;
    let live = true;
    const load = () =>
      getLiveAccess(eventId)
        .then((a) => live && setAccess(a))
        .catch(() => live && setAccess(null));
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [eventId, enabled]);

  return enabled ? access : null;
}
