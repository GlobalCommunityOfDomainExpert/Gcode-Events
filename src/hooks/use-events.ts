"use client";

import { useEffect, useState } from "react";
import { listEvents, type EventFilters } from "@/lib/api/events";
import { getEventTypes, getModes, getStatuses } from "@/lib/api/lookups";
import { adaptApiEvent } from "@/lib/api/adapters";
import { Event } from "@/lib/event";

type FetchStatus = "loading" | "error" | "ready";

// Fetches the event list + lookups, adapts each row to the UI Event shape.
export function useEvents(params: EventFilters = {}) {
  const [events, setEvents] = useState<Event[]>([]);
  const [status, setStatus] = useState<FetchStatus>("loading");
  // Serialize params so the effect only re-runs when the filters actually change.
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setStatus("loading");
      try {
        const [list, types, modes, statuses] = await Promise.all([
          listEvents(JSON.parse(paramsKey) as EventFilters),
          getEventTypes(),
          getModes(),
          getStatuses(),
        ]);
        if (cancelled) return;
        const typeNames = Object.fromEntries(types.map((t) => [t.id, t.name]));
        const modeNames = Object.fromEntries(modes.map((m) => [m.id, m.code]));
        const statusCodes = Object.fromEntries(
          statuses.map((s) => [s.id, s.code]),
        );
        setEvents(
          list.map((e) => adaptApiEvent(e, typeNames, modeNames, statusCodes)),
        );
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paramsKey]);

  return { events, status };
}
