"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  Compass,
  MapPin,
} from "lucide-react";
import {
  Badge,
  BookingRef,
  Button,
  ButtonLink,
  Icon,
  QrPlaceholder,
  SectionLabel,
} from "@/components/atoms";
import {
  Breadcrumb,
  EventBadgeRow,
  NotFoundState,
} from "@/components/molecules";
import { useEvent } from "@/hooks/use-event";
import { getParticipant } from "@/lib/api/participants";
import { ParticipantApi } from "@/lib/api/types";
import { getSession } from "@/lib/auth/session";
import { RegisteredSkeleton } from "./_components/registered-skeleton";

export default function EventRegisteredPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const participantId = searchParams.get("pid");
  const { event, status: eventStatus } = useEvent(params.id);
  const session = getSession();

  const [participant, setParticipant] = useState<ParticipantApi | undefined>();
  const [participantStatus, setParticipantStatus] = useState<
    "loading" | "error" | "ready"
  >("loading");
  const [qrDataUrl, setQrDataUrl] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!participantId) {
        setParticipantStatus("error");
        return;
      }
      try {
        const row = await getParticipant(participantId);
        if (cancelled) return;
        if (!row) {
          setParticipantStatus("error");
          return;
        }
        setParticipant(row);
        setParticipantStatus("ready");
      } catch {
        if (!cancelled) setParticipantStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [participantId]);

  // One QR per booking (not per ticket) — a single scan checks in every
  // ticket in this registration's quantity. Encodes an opaque reference the
  // check-in flow can look up server-side; nothing sensitive.
  useEffect(() => {
    if (!participant) return;
    const payload = `GCODE-PARTICIPANT-${participant.id}`;
    void QRCode.toDataURL(payload, { width: 200, margin: 1 }).then(
      setQrDataUrl,
    );
  }, [participant]);

  if (eventStatus === "loading" || participantStatus === "loading") {
    return <RegisteredSkeleton />;
  }

  if (!event) {
    return (
      <NotFoundState
        icon={Compass}
        title="Event not found"
        description="This event may not exist, or it couldn't be loaded."
        actionHref="/events"
        actionLabel="Browse Events"
      />
    );
  }

  if (participantStatus === "error" || !participant) {
    return (
      <NotFoundState
        icon={Compass}
        title="Registration not found"
        description="We couldn't find this registration. If you just signed up, check your email for confirmation."
        actionHref={`/events/${event.id}`}
        actionLabel="Back to Event"
      />
    );
  }

  const quantity = participant.quantity;
  const bookingRef = `GCODE-P${participant.id}`;
  const categoryLabel =
    participant.category === "PARTICIPANT"
      ? event.participantRegistration.label
      : event.attendeeRegistration.label;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Breadcrumb
          items={[
            { label: "Events", href: "/events" },
            { label: event.type, href: "/events" },
            { label: event.title, href: `/events/${event.id}` },
            { label: "Registered" },
          ]}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.back()}
          className="shrink-0"
        >
          <Icon icon={ArrowLeft} size="sm" /> Back
        </Button>
      </div>

      <div className="border-success/20 bg-success-light flex items-start gap-4 rounded-md border p-6">
        <div className="bg-success flex size-10 shrink-0 items-center justify-center rounded-full text-white">
          <Icon icon={Check} size="md" />
        </div>
        <div>
          <h1 className="text-large text-success font-bold">
            You&apos;re registered!
          </h1>
          <p className="text-body text-text-primary">
            A confirmation has been sent to your email address.
          </p>
          <p className="text-small text-text-secondary">
            {quantity} ticket{quantity === 1 ? "" : "s"} confirmed
          </p>
        </div>
      </div>

      <div className="border-border-light bg-surface-light overflow-hidden rounded-md border">
        <div className="bg-primary px-4 py-3">
          <Badge variant="solid" tone="neutral">
            {event.type}
          </Badge>
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <EventBadgeRow
              type={event.type}
              mode={event.mode}
              price={event.price}
            />
            {session && (
              <ButtonLink
                href={`/events/${event.id}`}
                variant="outline"
                size="sm"
              >
                View Event <Icon icon={ArrowRight} size="sm" />
              </ButtonLink>
            )}
          </div>
          <h2 className="text-body text-text-primary font-semibold">
            {event.title}
          </h2>
          <Badge variant="muted" tone="primary">
            {categoryLabel}
          </Badge>
          <p className="text-small text-text-secondary flex items-center gap-2">
            <Icon icon={Calendar} size="sm" />
            {event.date} · {event.time}
          </p>
          <p className="text-small text-text-secondary flex items-center gap-2">
            <Icon icon={MapPin} size="sm" />
            {event.location}
          </p>
        </div>
      </div>

      {participant.category === "PARTICIPANT" &&
        (event.audioRecordingEnabled ||
          event.trackSubmissionEnabled ||
          event.memberNamesEnabled ||
          event.ageCategoryRequirement !== "OFF") && (
          <div className="border-border-light bg-surface-light flex items-start gap-4 rounded-md border p-6">
            <div className="bg-warning-light flex size-10 shrink-0 items-center justify-center rounded-full">
              <Icon icon={AlertTriangle} size="md" className="text-warning" />
            </div>
            <div className="space-y-3">
              <p className="text-body text-text-primary">
                {event.audioRecordingEnabled
                  ? "You registered as a Participant — submit your audio submission URL within 24 hours of registration closing or your entry will be disqualified."
                  : "You registered as a Participant — there's some additional info to fill in for this event."}
              </p>
              <ButtonLink
                href={`/events/${event.id}/additional-info?pid=${participant.id}`}
                variant="primary"
                size="sm"
              >
                Additional Info <Icon icon={ArrowRight} size="sm" />
              </ButtonLink>
            </div>
          </div>
        )}

      <div className="border-border-light bg-surface-light space-y-4 rounded-md border p-6">
        <SectionLabel>Your Ticket</SectionLabel>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <QrPlaceholder src={qrDataUrl} loading={!qrDataUrl} />
          <div className="space-y-2">
            <p className="text-small text-text-secondary">Booking Reference</p>
            <BookingRef>{bookingRef}</BookingRef>
            <p className="text-small text-text-secondary">
              {quantity} ticket{quantity === 1 ? "" : "s"} · one QR code covers
              this whole booking — present it once at check-in.
            </p>
          </div>
        </div>
      </div>

      {session && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/my-events" variant="primary" className="flex-1">
            View My Events →
          </ButtonLink>
          <ButtonLink href="/events" variant="secondary" className="flex-1">
            Browse More Events
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
