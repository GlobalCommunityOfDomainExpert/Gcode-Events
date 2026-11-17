"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import {
  ArrowRight,
  CalendarPlus,
  Check,
  ClipboardCheck,
  Compass,
  MonitorPlay,
  ScanLine,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { ButtonLink, Icon } from "@/components/atoms";
import { Breadcrumb, NotFoundState } from "@/components/molecules";
import { useEvent } from "@/hooks/use-event";
import { googleCalendarUrl } from "@/lib/event";
import { getParticipant } from "@/lib/api/participants";
import { ParticipantApi } from "@/lib/api/types";
import { getSession } from "@/lib/auth/session";
import { renderTicketPng } from "@/lib/ticket-image";
import { RegisteredSkeleton } from "./_components/registered-skeleton";
import { Ticket } from "./_components/ticket";

export default function EventRegisteredPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const participantId = searchParams.get("pid");
  const additionalInfoComplete = searchParams.get("info") === "complete";
  const { event, status: eventStatus } = useEvent(params.id);
  const session = getSession();

  const [participant, setParticipant] = useState<ParticipantApi | undefined>();
  const [participantStatus, setParticipantStatus] = useState<
    "loading" | "error" | "ready"
  >("loading");
  const [qrDataUrl, setQrDataUrl] = useState<string | undefined>();
  const [downloading, setDownloading] = useState(false);

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

  const category = participant?.category ?? "ATTENDEE";
  const needsAdditionalInfo =
    !additionalInfoComplete &&
    !!event &&
    !!participant &&
    ((event.audioRecordingEnabled &&
      event.audioRecordingAppliesTo === category) ||
      event.questions.some((question) => question.appliesTo === category));

  useEffect(() => {
    if (needsAdditionalInfo && event && participant) {
      router.replace(
        `/events/${event.id}/additional-info?pid=${participant.id}`,
      );
    }
  }, [event, needsAdditionalInfo, participant, router]);

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
  const isBsssPartnerEvent = event.id === "481";
  const bookingRef = `GCODE-P${participant.id}`;
  const categoryLabel =
    participant.category === "PARTICIPANT"
      ? event.participantRegistration.label
      : event.attendeeRegistration.label;

  if (needsAdditionalInfo) return <RegisteredSkeleton />;

  const holder = participant.user_name || session?.fullName || "Guest";
  const firstName = holder.split(" ")[0];
  const online = event.mode === "Online";
  const isPerformer = participant.category === "PARTICIPANT";
  const hasEntryForm =
    (event.audioRecordingEnabled &&
      event.audioRecordingAppliesTo === category) ||
    event.questions.some((q) => q.appliesTo === category);
  const cal = googleCalendarUrl(event);

  async function downloadTicket() {
    if (!qrDataUrl || !event) return;
    setDownloading(true);
    try {
      const blob = await renderTicketPng({
        title: event.title,
        date: event.date,
        time: event.time,
        location: event.location,
        badge: "Partner",
        bookingRef,
        qrDataUrl,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${bookingRef}-ticket.png`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  const nextSteps: {
    icon: LucideIcon;
    title: string;
    text: string;
    action?: { label: string; href: string; external?: boolean };
  }[] = [
    ...(hasEntryForm
      ? [
          {
            icon: ClipboardCheck,
            title: "Entry details received",
            text: "Your answers and submission are with the organizer. You can update them until the deadline.",
            action: {
              label: "Edit entry",
              href: `/events/${event.id}/additional-info?pid=${participant.id}`,
            },
          },
        ]
      : []),
    ...(cal
      ? [
          {
            icon: CalendarPlus,
            title: "Save the date",
            text: `${event.date}${event.time ? ` · ${event.time}` : ""} — add it so you don't miss it.`,
            action: { label: "Add to calendar", href: cal, external: true },
          },
        ]
      : []),
    online
      ? {
          icon: MonitorPlay,
          title: "Join online",
          text: "Your join link is in your confirmation email. Open it a few minutes before the start.",
          ...(event.participationLink
            ? {
                action: {
                  label: "Open join link",
                  href: event.participationLink,
                  external: true,
                },
              }
            : {}),
        }
      : {
          icon: ScanLine,
          title: "On the day",
          text: `Arrive 15 minutes early and show this ticket at the door${quantity > 1 ? ` — one scan checks in all ${quantity} tickets` : ""}.`,
        },
    ...(isPerformer && event.timeline.length > 1
      ? [
          {
            icon: Trophy,
            title: "What's next for your entry",
            text: `${event.timeline[1]?.title ?? "The next round"} — we'll email you the results and your next steps.`,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Breadcrumb
        items={[
          { label: "Events", href: "/events" },
          { label: event.title, href: `/events/${event.id}` },
          { label: "Your ticket" },
        ]}
      />

      {/* success */}
      <div className="flex items-center gap-4">
        <span className="bg-success grid size-12 shrink-0 place-items-center rounded-full text-white shadow-sm">
          <Icon icon={Check} size="md" />
        </span>
        <div>
          <h1 className="text-display text-text-primary leading-tight font-extrabold">
            You&apos;re in, {firstName}!
          </h1>
          <p className="text-body text-text-secondary">
            {`${quantity} ticket${quantity === 1 ? "" : "s"} confirmed · we've emailed it to ${participant.email || "you"}.`}
          </p>
        </div>
      </div>

      <Ticket
        event={event}
        holder={holder}
        passLabel={categoryLabel}
        quantity={quantity}
        bookingRef={bookingRef}
        qrDataUrl={qrDataUrl}
        showQr
        onDownload={
          isBsssPartnerEvent ? () => void downloadTicket() : undefined
        }
        downloading={downloading}
      />

      {(isBsssPartnerEvent || event.id === "422") && (
        <div className="border-border-light bg-surface-light rounded-lg border p-5">
          {isBsssPartnerEvent && (
            <a
              href="https://gcode.in/ords/r/gcode2/gcode/sign-up"
              className="bg-primary hover:bg-primary-hover text-small inline-flex min-h-10 items-center justify-center rounded-sm px-4 py-2 font-semibold text-white"
            >
              Join Gcode partner ecosystem
            </a>
          )}
          {event.id === "422" && (
            <p className="text-small text-text-primary">
              For more information, call <strong>9355251219</strong> or WhatsApp{" "}
              <strong>8588868562</strong>.
            </p>
          )}
        </div>
      )}

      {/* what happens next — one row of steps under the ticket */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-text-primary text-lg font-bold">
            What happens next
          </h2>
          {session && (
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/events" variant="secondary" size="sm">
                Browse more events
              </ButtonLink>
              <ButtonLink href="/my-events" variant="primary" size="sm">
                All my tickets <Icon icon={ArrowRight} size="sm" />
              </ButtonLink>
            </div>
          )}
        </div>
        <ol
          className={`mt-4 grid gap-3 sm:grid-cols-2 ${nextSteps.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
        >
          {nextSteps.map((st, i) => (
            <li
              key={st.title}
              className="border-border-light bg-surface-light flex flex-col rounded-lg border p-5"
            >
              <div className="flex items-center gap-3">
                <span className="bg-primary-light text-primary grid size-10 shrink-0 place-items-center rounded-full">
                  <Icon icon={st.icon} size="sm" />
                </span>
                <span className="text-text-secondary text-xs font-bold tracking-wider uppercase">
                  Step {i + 1}
                </span>
              </div>
              <p className="text-text-primary mt-4 font-semibold">{st.title}</p>
              <p className="text-small text-text-secondary mt-1 flex-1">
                {st.text}
              </p>
              {st.action &&
                (st.action.external ? (
                  <a
                    href={st.action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-small mt-4 inline-flex items-center gap-1 font-semibold hover:underline"
                  >
                    {st.action.label}{" "}
                    <Icon icon={ArrowRight} size="sm" className="size-3.5" />
                  </a>
                ) : (
                  <Link
                    href={st.action.href}
                    className="text-primary text-small mt-4 inline-flex items-center gap-1 font-semibold hover:underline"
                  >
                    {st.action.label}{" "}
                    <Icon icon={ArrowRight} size="sm" className="size-3.5" />
                  </Link>
                ))}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
