"use client";

import { AttendeesTab } from "../../_components/attendees-tab";
import { useOrganizedEvent } from "../../_components/event-context";

export default function AttendeesPage() {
  const {
    event,
    attendees,
    attendeesLoading,
    selectedAttendeeIds,
    setSelectedAttendeeIds,
    refreshAttendees,
  } = useOrganizedEvent();

  return (
    <AttendeesTab
      event={event}
      attendees={attendees}
      loading={attendeesLoading}
      selectedIds={selectedAttendeeIds}
      onSelectedIdsChange={setSelectedAttendeeIds}
      onAttendeesChanged={refreshAttendees}
    />
  );
}
