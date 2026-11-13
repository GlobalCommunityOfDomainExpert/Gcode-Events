"use client";

import { Suspense } from "react";
import { PanelistsTab } from "../../_components/panelists-tab";
import { useOrganizedEvent } from "../../_components/event-context";

export default function PanelistsPage() {
  const { event } = useOrganizedEvent();
  // PanelistsTab reads ?invite=1 with useSearchParams, which needs a boundary.
  return (
    <Suspense fallback={null}>
      <PanelistsTab eventId={event.id} />
    </Suspense>
  );
}
