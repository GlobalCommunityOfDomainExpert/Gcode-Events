"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button, ButtonLink, Icon } from "@/components/atoms";
import { Banner, SectionHeader } from "@/components/molecules";
import { RoundsTab } from "../../_components/rounds-tab";
import { RoundsConfig } from "../../_components/rounds-config";
import { useOrganizedEvent } from "../../_components/event-context";

// Rounds = set up + run, both here. Configuration moved out of the public
// event editor: rounds/judging are an organizer workflow, not page content.
export default function RoundsPage() {
  const {
    event,
    attendees,
    showRounds,
    refreshAttendees,
    refreshEvent,
    notify,
  } = useOrganizedEvent();
  const [editing, setEditing] = useState(false);
  const hasRounds = event.rounds.length > 0;
  const participantsOpen = event.participantRegistration.enabled;
  const hasProgress = attendees.some((a) => a.category === "Participant");

  function saved() {
    setEditing(false);
    refreshEvent();
    notify("Rounds saved");
  }

  // No rounds yet → the setup form is the page.
  if (!hasRounds) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Rounds"
          description="Set up the stages participants go through — e.g. Screening → Semi final → Finale."
        />
        {!participantsOpen && <ParticipantPassNote eventId={event.id} />}
        <RoundsConfig eventId={event.id} hasProgress={false} onSaved={saved} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Rounds"
        description={
          editing
            ? "Change the stages, schedule and scoring. Saved straight to the event."
            : "Run judging, shortlist participants and move them through each round."
        }
        actions={
          !editing && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Icon icon={Settings2} size="sm" className="size-4" /> Edit rounds
            </Button>
          )
        }
      />

      {editing ? (
        <RoundsConfig
          eventId={event.id}
          hasProgress={hasProgress}
          onSaved={saved}
          onCancel={() => setEditing(false)}
        />
      ) : showRounds ? (
        <RoundsTab
          event={event}
          attendees={attendees}
          onAttendeesChanged={refreshAttendees}
          onEventChanged={refreshEvent}
        />
      ) : (
        <ParticipantPassNote eventId={event.id} />
      )}
    </div>
  );
}

function ParticipantPassNote({ eventId }: { eventId: string }) {
  return (
    <Banner tone="info">
      <span className="flex flex-wrap items-center justify-between gap-3">
        <span>
          Rounds are for participants. Turn on the Participant pass so people
          can register to compete — judging starts here once they do.
        </span>
        <ButtonLink
          href={`/my-organized-events/${eventId}/edit`}
          variant="secondary"
          size="sm"
        >
          Open Passes
        </ButtonLink>
      </span>
    </Banner>
  );
}
