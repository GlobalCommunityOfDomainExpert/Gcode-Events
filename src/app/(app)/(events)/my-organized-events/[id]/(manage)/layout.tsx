"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { Compass, ExternalLink } from "lucide-react";
import { Badge, ButtonLink } from "@/components/atoms";
import {
  Banner,
  ManageEventSkeleton,
  NotFoundState,
} from "@/components/molecules";
import { BackLink, PageHeader, Toast } from "@/components/layout";
import { eventTypeTone, priceTone, UpiClaim } from "@/lib/event";
import { listUpiClaims } from "@/lib/api/upi-claims";
import { adaptUpiClaim } from "@/lib/api/adapters";
import { useEvent } from "@/hooks/use-event";
import { useAttendees } from "@/hooks/use-attendees";
import { usePublishOrganizerNav } from "@/hooks/use-organizer-nav";
import { OrganizedEventContext } from "../_components/event-context";
import { eventTools } from "@/lib/organizer";

interface ToastState {
  message: string;
  tone: "success" | "info" | "error";
}

export default function OrganizedEventLayout({
  children,
}: {
  children: ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const {
    event,
    status: eventStatus,
    refresh: refreshEvent,
  } = useEvent(params.id);
  const {
    attendees,
    status: attendeesStatus,
    refresh: refreshAttendees,
  } = useAttendees(params.id, {
    attendee: event?.attendeeRegistration.price ?? 0,
    participant: event?.participantRegistration?.price ?? 0,
  });
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<string>>(
    new Set(),
  );
  const [claims, setClaims] = useState<UpiClaim[]>([]);
  const [claimsLoaded, setClaimsLoaded] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // UPI claims only exist for events with a paid pass, so free events skip the
  // request entirely (the sidebar badge and Next steps only use them when paid).
  const money = event ? eventTools(event).money : false;

  const refreshClaims = useCallback(async () => {
    if (!money) return;
    try {
      const items = await listUpiClaims(params.id);
      setClaims(items.map(adaptUpiClaim));
    } finally {
      setClaimsLoaded(true);
    }
  }, [params.id, money]);

  useEffect(() => {
    void refreshClaims();
  }, [refreshClaims]);

  const notify = useCallback(
    (message: string, tone: ToastState["tone"] = "success") =>
      setToast({ message, tone }),
    [],
  );

  const value = useMemo(() => {
    if (!event) return null;
    // Closing the Participant pass shouldn't hide an already-registered
    // cohort's rounds — judging must still run for people who signed up
    // before the toggle closed.
    const hasParticipants = attendees.some((a) => a.category === "Participant");
    return {
      event,
      attendees,
      refreshEvent: () => refreshEvent(),
      refreshAttendees,
      attendeesLoading: attendeesStatus === "loading",
      claims: money ? claims : [],
      claimsLoaded: money ? claimsLoaded : true,
      refreshClaims,
      selectedAttendeeIds,
      setSelectedAttendeeIds,
      showRounds:
        (event.participantRegistration.enabled || hasParticipants) &&
        event.rounds.length > 0,
      isCancelled: event.status === "CANCELLED",
      notify,
    };
  }, [
    event,
    attendees,
    attendeesStatus,
    refreshEvent,
    refreshAttendees,
    money,
    claims,
    claimsLoaded,
    refreshClaims,
    selectedAttendeeIds,
    notify,
  ]);

  usePublishOrganizerNav(
    event && value
      ? {
          id: event.id,
          title: event.title,
          attendeeCount: attendees.length,
          roundsCount: event.rounds.length,
          showRounds: value.showRounds,
          isDraft: event.status === "DRAFT",
          pendingClaims: claims.filter((c) => c.status === "PENDING").length,
          tools: eventTools(event),
          type: event.type,
        }
      : null,
  );

  // Keep the real skeleton while the first fetch is in flight; the not-found
  // card only shows once the load finished without an event.
  if (!event && eventStatus === "loading") return <ManageEventSkeleton />;

  if (!event || !value) {
    return (
      <div className="pt-8">
        <NotFoundState
          icon={Compass}
          title="Event not found"
          description="This event may not exist, or it couldn't be loaded."
          actionHref="/my-organized-events"
          actionLabel="Back to Organizing"
        />
      </div>
    );
  }

  const base = `/my-organized-events/${event.id}`;
  const isCancelled = value.isCancelled;
  const isDraft = event.status === "DRAFT";
  const onSettings = pathname.startsWith(`${base}/settings`);

  return (
    <OrganizedEventContext.Provider value={value}>
      <div className="pt-8">
        <PageHeader
          back={<BackLink href="/my-organized-events">All events</BackLink>}
          title={event.title}
          meta={
            <>
              {isCancelled ? (
                <Badge tone="danger" size="sm">
                  Cancelled
                </Badge>
              ) : isDraft ? (
                <Badge tone="neutral" size="sm">
                  Draft
                </Badge>
              ) : (
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
            </>
          }
          subtitle={[event.date, event.time].filter(Boolean).join(" · ")}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink
                href={`/events/${event.id}`}
                variant="secondary"
                size="sm"
              >
                View public page <ExternalLink className="size-4" />
              </ButtonLink>
            </div>
          }
        />

        {isCancelled && (
          <div className="mb-4">
            <Banner tone="danger">
              This event has been cancelled and is no longer accepting
              registrations.
            </Banner>
          </div>
        )}

        <div
          className={
            isCancelled && !onSettings
              ? "pointer-events-none opacity-50 grayscale"
              : ""
          }
        >
          {children}
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onDismiss={() => setToast(null)}
        />
      )}
    </OrganizedEventContext.Provider>
  );
}
