"use client";

import { PanelistsTab } from "../../_components/panelists-tab";
import { useOrganizedEvent } from "../../_components/event-context";

export default function PanelistsPage() {
  const { event } = useOrganizedEvent();
  return <PanelistsTab eventId={event.id} />;
}
