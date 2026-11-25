"use client";

import { useEffect, useState } from "react";
import { useSession } from "./use-session";
import { getMyPanelistAccess } from "@/lib/api/panelists";

// Whether the signed-in user is an ACCEPTED panelist for this event — the
// gate for the /judge/[id] scoring route. The server enforces the same rule
// on every judging endpoint; this only decides what the page shows.
export function usePanelistAccess(eventId: string | undefined) {
  const session = useSession();
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [isAcceptedPanelist, setIsAcceptedPanelist] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!eventId || !session) {
        if (!cancelled) setStatus("ready");
        return;
      }
      try {
        const access = await getMyPanelistAccess(eventId);
        if (!cancelled) setIsAcceptedPanelist(access.isAcceptedPanelist);
      } catch {
        if (!cancelled) setIsAcceptedPanelist(false);
      } finally {
        if (!cancelled) setStatus("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, session]);

  return { status, isAcceptedPanelist };
}
