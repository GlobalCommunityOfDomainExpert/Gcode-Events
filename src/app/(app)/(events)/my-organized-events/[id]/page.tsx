"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Compass } from "lucide-react";
import { Badge, Button, ButtonLink } from "@/components/atoms";
import {
  Banner,
  Breadcrumb,
  Modal,
  NotFoundState,
  Tabs,
} from "@/components/molecules";
import { eventTypeTone, priceTone } from "@/lib/event";
import { useEvent } from "@/hooks/use-event";
import { useAttendees } from "@/hooks/use-attendees";
import { AttendeesTab } from "./_components/attendees-tab";
import { CommunicationTab } from "./_components/communication-tab";
import { OverviewTab } from "./_components/overview-tab";
import { PanelistsTab } from "./_components/panelists-tab";
import { CouponsTab } from "./_components/coupons-tab";
import { UpiClaimsTab } from "./_components/upi-claims-tab";
import { RoundsTab } from "./_components/rounds-tab";

export default function OrganizedEventDetailPage() {
  const params = useParams<{ id: string }>();
  const {
    event,
    status: eventStatus,
    refresh: refreshEvent,
  } = useEvent(params.id);
  const { attendees, refresh: refreshAttendees } = useAttendees(params.id, {
    attendee: event?.attendeeRegistration.price ?? 0,
    participant: event?.participantRegistration?.price ?? 0,
  });

  const [activeTab, setActiveTab] = useState("overview");
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<string>>(
    new Set(),
  );
  const [showCancelModal, setShowCancelModal] = useState(false);

  if (!event) {
    return (
      <NotFoundState
        icon={Compass}
        title={eventStatus === "loading" ? "Loading event…" : "Event not found"}
        description={
          eventStatus === "loading"
            ? "Fetching this event from the server."
            : "This event may not exist, or it couldn't be loaded."
        }
        actionHref="/my-organized-events"
        actionLabel="Back to Organizing"
      />
    );
  }

  const eventId = event.id;
  const isCancelled = event.status === "CANCELLED";

  // Closing the Participant pass (registration toggle off) shouldn't hide
  // an already-registered cohort's rounds — an organizer still needs to run
  // judging for people who signed up before the toggle closed.
  const hasParticipants = attendees.some((a) => a.category === "Participant");
  const showRoundsTab =
    (event.participantRegistration.enabled || hasParticipants) &&
    event.rounds.length > 0;

  const tabItems = [
    { value: "overview", label: "Overview" },
    { value: "attendees", label: `Attendees (${attendees.length})` },
    ...(showRoundsTab
      ? [{ value: "rounds", label: `Rounds (${event.rounds.length})` }]
      : []),
    { value: "panelists", label: "Panelists" },
    { value: "coupons", label: "Coupons" },
    { value: "upi-claims", label: "UPI Claims" },
    { value: "communication", label: "Communication" },
  ];

  function handleConfirmCancel() {
    // TODO: call src/lib/api/events.ts updateEvent(eventId, { status_id: <cancelled> })
    setShowCancelModal(false);
  }

  return (
    <>
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: "Organizing", href: "/my-organized-events" },
            { label: event.title },
          ]}
        />

        {isCancelled && (
          <Banner tone="danger">
            This event has been cancelled and is no longer accepting
            registrations.
          </Banner>
        )}

        <div className="border-border-light bg-surface-light rounded-md border p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {!isCancelled && (
                  <Badge variant="muted" tone="success" size="sm">
                    ● Live
                  </Badge>
                )}
                <Badge tone={eventTypeTone(event.type)} size="sm">
                  {event.type}
                </Badge>
                <Badge tone="neutral" size="sm">
                  {event.mode}
                </Badge>
                <Badge tone={priceTone(event.price)} size="sm">
                  {event.price}
                </Badge>
                {isCancelled && (
                  <Badge tone="danger" size="sm">
                    Cancelled
                  </Badge>
                )}
              </div>
              <h1 className="text-heading text-text-primary font-extrabold">
                {event.title}
              </h1>
              <p className="text-small text-text-secondary">
                {event.date} · {event.time} · {event.mode}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-5">
              <div className="text-center">
                <p className="text-heading text-text-primary font-extrabold">
                  {event.registeredCount}
                </p>
                <p className="text-small text-text-secondary tracking-wide uppercase">
                  Registered
                </p>
              </div>
              {event.capacity !== undefined && (
                <>
                  <div className="bg-border-light h-10 w-px" />
                  <div className="text-center">
                    <p className="text-heading text-text-primary font-extrabold">
                      {event.capacity}
                    </p>
                    <p className="text-small text-text-secondary tracking-wide uppercase">
                      Capacity
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="border-border-light mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <ButtonLink
              href={`/events/${event.id}`}
              variant="secondary"
              size="sm"
            >
              View Public Page →
            </ButtonLink>
            {!isCancelled && (
              <>
                <ButtonLink
                  href={`/my-organized-events/${event.id}/edit`}
                  variant="secondary"
                  size="sm"
                >
                  Edit Event →
                </ButtonLink>
                <Button
                  variant="danger-ghost"
                  size="sm"
                  onClick={() => setShowCancelModal(true)}
                >
                  Cancel Event
                </Button>
              </>
            )}
          </div>
        </div>

        <div
          className={`border-border-light bg-surface-light rounded-md border p-4 ${
            isCancelled ? "pointer-events-none opacity-50 grayscale" : ""
          }`}
        >
          <Tabs items={tabItems} value={activeTab} onChange={setActiveTab} />
          <div className="mt-4">
            {activeTab === "overview" && (
              <OverviewTab
                event={event}
                attendees={attendees}
                onEventChanged={refreshEvent}
              />
            )}
            {activeTab === "attendees" && (
              <AttendeesTab
                event={event}
                attendees={attendees}
                selectedIds={selectedAttendeeIds}
                onSelectedIdsChange={setSelectedAttendeeIds}
                onNavigateToCommunication={() => setActiveTab("communication")}
                onAttendeesChanged={refreshAttendees}
              />
            )}
            {activeTab === "rounds" && showRoundsTab && (
              <RoundsTab
                event={event}
                attendees={attendees}
                onAttendeesChanged={refreshAttendees}
                onEventChanged={refreshEvent}
              />
            )}
            {activeTab === "panelists" && <PanelistsTab eventId={event.id} />}
            {activeTab === "coupons" && <CouponsTab eventId={event.id} />}
            {activeTab === "upi-claims" && <UpiClaimsTab eventId={event.id} />}
            {activeTab === "communication" && (
              <CommunicationTab
                event={event}
                attendees={attendees}
                selectedIds={selectedAttendeeIds}
              />
            )}
          </div>
        </div>
      </div>

      <Modal
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel this event?"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCancelModal(false)}
            >
              Keep event
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmCancel}>
              Cancel Event
            </Button>
          </>
        }
      >
        This removes the event from active registration and marks it cancelled
        on its public page. This can&apos;t be undone.
      </Modal>
    </>
  );
}
