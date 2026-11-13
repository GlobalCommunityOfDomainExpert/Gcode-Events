"use client";

import { Banner } from "@/components/molecules";
import { ButtonLink } from "@/components/atoms";
import { RoundsTab } from "../../_components/rounds-tab";
import { useOrganizedEvent } from "../../_components/event-context";

// Functional parity with the old Rounds tab: run judging when participants
// exist. Setup moves onto this page later in the release (see the Rounds
// commit); until then rounds are still configured in the event editor.
export default function RoundsPage() {
  const { event, attendees, showRounds, refreshAttendees, refreshEvent } =
    useOrganizedEvent();

  if (!showRounds) {
    return (
      <Banner tone="info">
        <span className="flex flex-wrap items-center justify-between gap-3">
          <span>
            Rounds run once a Participant pass is open (or has registrations)
            and rounds are defined. Set them up in the event editor.
          </span>
          <ButtonLink
            href={`/my-organized-events/${event.id}/edit`}
            variant="secondary"
            size="sm"
          >
            Open editor
          </ButtonLink>
        </span>
      </Banner>
    );
  }

  return (
    <RoundsTab
      event={event}
      attendees={attendees}
      onAttendeesChanged={refreshAttendees}
      onEventChanged={refreshEvent}
    />
  );
}
