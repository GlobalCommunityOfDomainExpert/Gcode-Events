"use client";

import { useEffect, useState } from "react";
import { listMyParticipations } from "@/lib/api/participants";
import { getEventTypes, getModes, getStatuses } from "@/lib/api/lookups";
import { adaptMyParticipation } from "@/lib/api/adapters";
import { getSession } from "@/lib/auth/session";
import { MyTicket } from "@/lib/event";

type FetchStatus = "loading" | "error" | "ready";

// The signed-in user's own event registrations + ticket info, resolved
// server-side from the token (GET /participants/mine) — not derived by
// cross-referencing the full public events list.
export function useMyTickets() {
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [status, setStatus] = useState<FetchStatus>("loading");

  useEffect(() => {
    const session = getSession();
    if (!session) return;

    let cancelled = false;
    void (async () => {
      setStatus("loading");
      try {
        const [rows, types, modes, statuses] = await Promise.all([
          listMyParticipations(),
          getEventTypes(),
          getModes(),
          getStatuses(),
        ]);
        if (cancelled) return;
        const typeNames = Object.fromEntries(types.map((t) => [t.id, t.name]));
        const modeNames = Object.fromEntries(
          modes.map((m) => [m.id, m.code]),
        );
        const statusCodes = Object.fromEntries(
          statuses.map((s) => [s.id, s.code]),
        );
        setTickets(
          rows.map((row) =>
            adaptMyParticipation(row, typeNames, modeNames, statusCodes),
          ),
        );
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { tickets, status };
}
