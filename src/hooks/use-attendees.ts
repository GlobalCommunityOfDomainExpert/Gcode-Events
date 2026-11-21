"use client";

import { useCallback, useEffect, useState } from "react";
import { listParticipants } from "@/lib/api/participants";
import { adaptParticipant } from "@/lib/api/adapters";
import { Attendee } from "@/lib/attendees";

type FetchStatus = "loading" | "error" | "ready";

// Fetches the real attendee list (GCODE_EVENT_PARTICIPANTS) for one event.
// `prices` carries both registration categories' prices, since a row may
// have registered under either one (see adaptParticipant).
export function useAttendees(
  eventId: string | undefined,
  prices: { attendee: number; participant: number },
) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [status, setStatus] = useState<FetchStatus>("loading");

  const refresh = useCallback(async () => {
    if (!eventId) return;
    try {
      const rows = await listParticipants(eventId);
      // list_by_event returns every row regardless of ACTIVE/STATUS —
      // a soft-removed participant (delete_participant sets ACTIVE='N',
      // STATUS='CANCELLED' rather than hard-deleting, to keep score/
      // decision/payment history intact for tracking) stays queryable at
      // the DB level but shouldn't show up in the organizer's working
      // list here.
      setAttendees(
        rows
          .filter((row) => row.active)
          .map((row) => adaptParticipant(row, prices)),
      );
      setStatus("ready");
    } catch {
      setStatus("error");
    }
    // Depend on the primitive prices, not the `prices` object itself — the
    // caller passes a fresh object literal every render, which would
    // otherwise refetch on every render instead of only when a price changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, prices.attendee, prices.participant]);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  return { attendees, status, refresh };
}
