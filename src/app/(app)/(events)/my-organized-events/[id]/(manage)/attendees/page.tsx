"use client";

import { useRouter } from "next/navigation";
import { ORGANIZER_PORTAL_ENABLED } from "@/lib/feature-flags";
import { AttendeesTab } from "../../_components/attendees-tab";
import { useOrganizedEvent } from "../../_components/event-context";

export default function AttendeesPage() {
  const router = useRouter();
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
      onNavigateToCommunication={
        ORGANIZER_PORTAL_ENABLED
          ? () => router.push(`/my-organized-events/${event.id}/communication`)
          : undefined
      }
    />
  );
}
