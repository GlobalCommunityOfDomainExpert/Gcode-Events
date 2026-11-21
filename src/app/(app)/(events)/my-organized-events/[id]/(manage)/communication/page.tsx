"use client";

import { CommunicationTab } from "../../_components/communication-tab";
import { useOrganizedEvent } from "../../_components/event-context";

export default function CommunicationPage() {
  const { event, attendees, selectedAttendeeIds } = useOrganizedEvent();
  return (
    <CommunicationTab
      event={event}
      attendees={attendees}
      selectedIds={selectedAttendeeIds}
    />
  );
}
