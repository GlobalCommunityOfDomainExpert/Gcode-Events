"use client";

import { useCallback, useEffect, useState } from "react";
import { getEvent, listEventTimeline } from "@/lib/api/events";
import { listEventRounds } from "@/lib/api/rounds";
import { getEventTypes, getModes, getStatuses } from "@/lib/api/lookups";
import {
  adaptApiEvent,
  adaptTimelineItem,
  adaptEventRound,
  formatDuration,
} from "@/lib/api/adapters";
import { Event } from "@/lib/event";

type FetchStatus = "loading" | "error" | "ready";

// Fetches one event by id + the lookup tables, then adapts to the UI Event shape.
export function useEvent(id: string | undefined) {
  const [event, setEvent] = useState<Event | undefined>(undefined);
  const [status, setStatus] = useState<FetchStatus>("loading");

  // Exposed so callers (e.g. the organizer's runtime pass open/close toggle)
  // can re-fetch after writing, instead of only ever fetching once on mount.
  // `silent` re-fetches in the background without flipping to "loading", so
  // the page doesn't flash its skeleton (used after "I'm Interested").
  const refresh = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!id) return;
      if (!silent) setStatus("loading");
      try {
        const [detail, timeline, rounds, types, modes, statuses] =
          await Promise.all([
            getEvent(id),
            listEventTimeline(id),
            listEventRounds(id),
            getEventTypes(),
            getModes(),
            getStatuses(),
          ]);
        const typeNames = Object.fromEntries(types.map((t) => [t.id, t.name]));
        const modeNames = Object.fromEntries(
          modes.map((m) => [m.id, m.mode_name]),
        );
        const statusCodes = Object.fromEntries(
          statuses.map((s) => [s.id, s.status_code]),
        );
        const adapted = adaptApiEvent(
          detail,
          typeNames,
          modeNames,
          statusCodes,
        );
        // Fall back to timeline span when the event has no explicit end date.
        let duration = adapted.duration;
        if (!duration && timeline.length > 0) {
          const starts = timeline
            .filter((t) => t.start_time)
            .map((t) => new Date(t.start_time as string).getTime());
          const ends = timeline
            .filter((t) => t.end_time)
            .map((t) => new Date(t.end_time as string).getTime());
          if (starts.length > 0 && ends.length > 0) {
            duration = formatDuration(
              new Date(Math.min(...starts)).toISOString(),
              new Date(Math.max(...ends)).toISOString(),
            );
          }
        }
        setEvent({
          ...adapted,
          timeline: timeline.map(adaptTimelineItem),
          rounds: rounds.map(adaptEventRound),
          duration,
        });
        setStatus("ready");
      } catch {
        // A failed background refresh keeps showing the last good event.
        if (!silent) setStatus("error");
      }
    },
    [id],
  );

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  return { event, status, refresh };
}
