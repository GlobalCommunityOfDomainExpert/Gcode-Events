"use client";

import Link from "next/link";
import {
  CalendarPlus,
  Download,
  ExternalLink,
  Lock,
  Monitor,
  PlayCircle,
  ScanLine,
  Video,
} from "lucide-react";
import { Icon } from "@/components/atoms";
import {
  googleCalendarUrl,
  formatTimeRange,
  formatWeekday,
  type Event,
} from "@/lib/event";
import { getEventColor } from "@/lib/event-color";
import { useLiveAccess } from "@/hooks/use-live-access";
import { hasLiveRoom } from "@/lib/live-room";
import { serverNow } from "@/lib/server-time";
import { OPENS_BEFORE_MIN } from "@/lib/webinar";

// The booking as an actual ticket: banner, the details you'd check at the
// door, a perforated tear line, and a stub — the check-in QR for venue
// events, a plain "online event" note for online ones.

export interface TicketProps {
  event: Event;
  holder: string;
  passLabel: string;
  quantity: number;
  bookingRef: string;
  qrDataUrl?: string;
  /** Some partner events don't use QR check-in. */
  showQr: boolean;
  /** Replaces the plain QR download (e.g. partner events' branded PNG). */
  onDownload?: () => void;
  downloading?: boolean;
}

const actionClass =
  "text-small text-primary inline-flex items-center gap-1.5 font-semibold hover:underline";

export function Ticket({
  event,
  holder,
  passLabel,
  quantity,
  bookingRef,
  qrDataUrl,
  showQr,
  onDownload,
  downloading,
}: TicketProps) {
  const online = event.mode === "Online";
  const weekday = formatWeekday(event.startDateIso);
  const time = formatTimeRange(event.startDateIso, event.endDateIso);
  const cal = googleCalendarUrl(event);

  const fields: [string, string][] = [
    ["Date", weekday ? `${weekday.slice(0, 3)}, ${event.date}` : event.date],
    ["Time", time ? `${time} IST` : event.time || "TBA"],
    [
      online ? "Where" : "Venue",
      online ? "Online" : event.location || "Venue TBA",
    ],
    ["Pass", passLabel],
    ["Name", holder],
    ["Tickets", `${quantity} ticket${quantity === 1 ? "" : "s"}`],
  ];

  return (
    <div className="@container drop-shadow-[0_10px_25px_rgba(15,28,40,0.10)]">
      <div className="bg-surface-light border-border-light overflow-hidden rounded-t-xl border border-b-0">
        {/* banner */}
        <div
          className="relative aspect-[3/1] w-full"
          style={
            event.coverImageUrl
              ? undefined
              : { backgroundColor: getEventColor(event.id) }
          }
        >
          {event.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.coverImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </div>
      </div>

      <div className="bg-surface-light border-border-light flex flex-col border-x @xl:flex-row">
        {/* details */}
        <div className="min-w-0 flex-1 p-6">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="bg-primary rounded-full px-2 py-0.5 text-xs font-semibold text-white">
              {event.type}
            </span>
            <span className="border-border-hover text-text-primary rounded-full border px-2 py-0.5 text-xs font-semibold">
              {event.mode}
            </span>
          </div>
          <h2 className="text-text-primary mt-3 text-xl leading-snug font-extrabold">
            {event.title}
          </h2>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 @3xl:grid-cols-3">
            {fields.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-text-secondary text-[11px] font-semibold tracking-wider uppercase">
                  {k}
                </dt>
                <dd className="text-small text-text-primary mt-0.5 line-clamp-2 font-semibold">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* tear line — vertical on desktop, horizontal on phones */}
        <div aria-hidden className="relative @xl:w-0">
          <div className="border-border-hover mx-6 border-t-2 border-dashed @xl:mx-0 @xl:my-6 @xl:h-[calc(100%-3rem)] @xl:border-t-0 @xl:border-l-2" />
          <span className="bg-background border-border-light absolute top-1/2 -left-px size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border @xl:top-0 @xl:left-1/2 @xl:-translate-y-1/2" />
          <span className="bg-background border-border-light absolute top-1/2 -right-px size-6 translate-x-1/2 -translate-y-1/2 rounded-full border @xl:top-auto @xl:right-auto @xl:bottom-0 @xl:left-1/2 @xl:-translate-x-1/2 @xl:translate-y-1/2" />
        </div>

        {/* stub */}
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center @xl:w-52">
          {online ? (
            hasLiveRoom(event) ? (
              <LiveStub event={event} bookingRef={bookingRef} />
            ) : (
              <OnlineStub event={event} bookingRef={bookingRef} />
            )
          ) : showQr ? (
            <>
              <div className="border-border-light rounded-lg border bg-white p-2">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt={`Check-in QR for ${bookingRef}`}
                    className="size-32"
                  />
                ) : (
                  <div className="bg-bg-light size-32 animate-pulse rounded" />
                )}
              </div>
              <p className="text-text-primary font-mono text-sm font-bold tracking-wider">
                {bookingRef}
              </p>
              <p className="text-text-secondary flex items-center gap-1 text-xs">
                <Icon icon={ScanLine} size="sm" className="size-3.5" />
                {quantity > 1
                  ? `One scan checks in all ${quantity}`
                  : "Show at the door"}
              </p>
            </>
          ) : (
            <>
              <p className="text-text-secondary text-[11px] font-semibold tracking-wider uppercase">
                Booking
              </p>
              <p className="text-text-primary font-mono text-sm font-bold tracking-wider">
                {bookingRef}
              </p>
            </>
          )}
        </div>
      </div>

      {/* actions */}
      <div className="bg-surface-light border-border-light flex flex-wrap items-center gap-x-5 gap-y-2 rounded-b-xl border px-6 py-3">
        {!online &&
          showQr &&
          qrDataUrl &&
          (onDownload ? (
            <button
              type="button"
              disabled={downloading}
              onClick={onDownload}
              className={`${actionClass} disabled:opacity-60`}
            >
              <Icon icon={Download} size="sm" className="size-4" />{" "}
              {downloading ? "Preparing…" : "Download ticket"}
            </button>
          ) : (
            <a
              href={qrDataUrl}
              download={`${bookingRef}.png`}
              className={actionClass}
            >
              <Icon icon={Download} size="sm" className="size-4" /> Download PNG
            </a>
          ))}
        {cal && (
          <a
            href={cal}
            target="_blank"
            rel="noopener noreferrer"
            className={actionClass}
          >
            <Icon icon={CalendarPlus} size="sm" className="size-4" /> Add to
            calendar
          </a>
        )}
        <Link
          href={`/events/${event.id}`}
          className="text-small text-text-secondary hover:text-text-primary ml-auto inline-flex items-center gap-1.5 font-semibold"
        >
          Event page <Icon icon={ExternalLink} size="sm" className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

// Online events have no live room here: the join details come by email, or
// from the event's own participation link when it has one.
function OnlineStub({
  event,
  bookingRef,
}: {
  event: Event;
  bookingRef: string;
}) {
  return (
    <>
      <span className="bg-bg-light grid size-12 place-items-center rounded-full">
        <Icon icon={Monitor} size="sm" className="text-text-secondary" />
      </span>
      <p className="text-small text-text-primary font-semibold">Online event</p>
      <p className="text-text-secondary text-xs">
        Your link is in your confirmation email.
      </p>
      {event.participationLink && (
        <a
          href={event.participationLink}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-primary hover:bg-primary-hover text-small mt-1 inline-flex h-9 items-center gap-1.5 rounded-sm px-4 font-semibold text-white"
        >
          Join link <Icon icon={ExternalLink} size="sm" className="size-4" />
        </a>
      )}
      <p className="text-text-primary mt-1 font-mono text-xs font-bold tracking-wider">
        {bookingRef}
      </p>
    </>
  );
}

// An online event with a live room: the stub follows the server's door state.
// Having a ticket is what brought the viewer to this page, but the state still
// comes from live-access, so a wrong clock or a forwarded link changes nothing.
function LiveStub({ event, bookingRef }: { event: Event; bookingRef: string }) {
  const access = useLiveAccess(event.id, true);
  const door = `/events/${event.id}/live`;
  const opensAt = event.startDateIso
    ? new Date(event.startDateIso).getTime() -
      OPENS_BEFORE_MIN.attendee * 60_000
    : 0;
  const left = opensAt
    ? Math.max(0, Math.round((opensAt - serverNow().getTime()) / 60_000))
    : null;

  if (access?.state === "ENDED")
    return (
      <>
        <Icon icon={PlayCircle} size="lg" className="text-primary" />
        <p className="text-small text-text-primary font-semibold">
          {access.replay ? "Replay ready" : "Session ended"}
        </p>
        {access.replay && (
          <Link
            href={door}
            className="bg-primary hover:bg-primary-hover text-small mt-1 inline-flex h-9 items-center rounded-sm px-4 font-semibold text-white"
          >
            Watch replay
          </Link>
        )}
      </>
    );
  if (access?.state === "OPEN" || access?.state === "BACKSTAGE")
    return (
      <>
        <span className="relative">
          <Icon icon={Video} size="lg" className="text-primary" />
          <span
            className={`absolute -top-0.5 -right-1 size-2.5 animate-pulse rounded-full ${access.live ? "bg-secondary" : "bg-success"}`}
          />
        </span>
        <p className="text-small text-text-primary font-semibold">
          {access.live ? "Live now" : "Doors are open"}
        </p>
        <Link
          href={door}
          className="bg-primary hover:bg-primary-hover text-small mt-1 inline-flex h-9 items-center gap-1.5 rounded-sm px-4 font-semibold text-white"
        >
          <Icon icon={Video} size="sm" className="size-4" /> Join now
        </Link>
      </>
    );
  return (
    <>
      <span className="bg-bg-light grid size-12 place-items-center rounded-full">
        <Icon icon={Lock} size="sm" className="text-text-secondary" />
      </span>
      <p className="text-text-secondary text-[11px] font-semibold tracking-wider uppercase">
        Live room unlocks in
      </p>
      <p className="text-text-primary text-lg font-extrabold tabular-nums">
        {left === null
          ? "—"
          : left >= 60 * 24
            ? `${Math.floor(left / (60 * 24))} d`
            : left >= 60
              ? `${Math.floor(left / 60)} h ${left % 60} min`
              : `${left} min`}
      </p>
      <p className="text-text-secondary text-xs">
        Open this ticket again then. Your seat is tied to your account, so there
        is no link to keep.
      </p>
      <p className="text-text-primary mt-1 font-mono text-xs font-bold tracking-wider">
        {bookingRef}
      </p>
    </>
  );
}
