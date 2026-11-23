"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Mic,
  MicOff,
  Video,
  VideoOff,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/atoms";
import type { Event } from "@/lib/event";
import {
  OPENS_BEFORE_MIN,
  ROLE_CAN,
  ROLE_LABEL,
  initials,
  type WebinarRole,
} from "@/lib/webinar";
import { btnLight, btnOnDark } from "./room-frame";

// The waiting room, copied from the advisory app's call lobby: your own
// camera and mic first (so you know they work), the session on the right,
// and one big "Join now". Devices are released the moment you go in, so the
// room can use them. Attendees publish nothing, so they get the stage
// poster instead of a camera check.

type MediaStatus = "asking" | "ready" | "blocked" | "unsupported";

function useLocalMedia(enabled: boolean) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<MediaStatus>("asking");
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let raf = 0;
    let ctx: AudioContext | null = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      requestAnimationFrame(() => setStatus("unsupported"));
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        setStream(s);
        setStatus("ready");
        // mic level meter
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 256;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        const loop = () => {
          an.getByteFrequencyData(buf);
          setLevel(
            Math.min(1, buf.reduce((a, b) => a + b, 0) / buf.length / 60),
          );
          raf = requestAnimationFrame(loop);
        };
        loop();
      })
      .catch(() => !cancelled && setStatus("blocked"));
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      void ctx?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled]);

  return {
    stream,
    status,
    mic,
    cam,
    level: mic ? level : 0,
    toggleMic: () => {
      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !mic));
      setMic(!mic);
    },
    toggleCam: () => {
      streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !cam));
      setCam(!cam);
    },
    stop: () => streamRef.current?.getTracks().forEach((t) => t.stop()),
  };
}

function SelfView({
  stream,
  camOn,
  name,
}: {
  stream: MediaStream | null;
  camOn: boolean;
  name: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream)
      ref.current.srcObject = stream;
  }, [stream, camOn]);
  if (stream && camOn) {
    return (
      <video
        ref={ref}
        autoPlay
        muted
        playsInline
        aria-label="Your camera"
        className="size-full -scale-x-100 rounded-[inherit] object-cover"
      />
    );
  }
  return (
    <div className="text-center text-white/80">
      {stream ? (
        <div className="mx-auto grid size-24 place-items-center rounded-full bg-white/15 text-3xl font-bold">
          {initials(name)}
        </div>
      ) : (
        <VideoOff className="mx-auto size-8" aria-hidden />
      )}
      <p className="text-small mt-2">
        {stream ? "Camera is off" : "No camera yet"}
      </p>
    </div>
  );
}

/** White tint when on, red when off, 48px — the advisory room's control. */
function RoundButton({
  on,
  iconOn,
  iconOff,
  label,
  onClick,
  disabled,
}: {
  on: boolean;
  iconOn: LucideIcon;
  iconOff: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const I = on ? iconOn : iconOff;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={`${label}${on ? "" : " (off)"}`}
      className={`grid size-12 place-items-center rounded-full text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? "bg-white/15 hover:bg-white/25" : "bg-danger hover:bg-danger/90"}`}
    >
      <I className="size-5" aria-hidden />
    </button>
  );
}

export function WaitingRoom({
  event,
  role,
  notice,
  name,
  when,
  backstage,
  audience,
  onJoin,
}: {
  event: Event;
  role: WebinarRole;
  audience: "interactive" | "livestream";
  notice?: string;
  name: string;
  when: string;
  backstage: boolean;
  /** Asks the server for a credential; rejects when not allowed. */
  onJoin: () => Promise<void>;
}) {
  // Interactive: every attendee publishes too, so they get the camera check.
  const onStage = ROLE_CAN[role].publish || audience === "interactive";
  const media = useLocalMedia(onStage);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    setJoining(true);
    setError("");
    try {
      // The server checks the registration and the time window, and mints a
      // credential for this role. Devices are only released once that works.
      await onJoin();
      media.stop();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't let you in right now.",
      );
      setJoining(false);
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 px-4 pb-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        {onStage ? (
          <>
            <div className="relative grid aspect-video place-items-center overflow-hidden rounded-md bg-black/35 ring-1 ring-white/10">
              <SelfView stream={media.stream} camOn={media.cam} name={name} />
              {media.status === "asking" && (
                <p className="text-small absolute bottom-3 left-3 rounded-full bg-black/50 px-3 py-1">
                  Allow camera and microphone to check them
                </p>
              )}
              {(media.status === "blocked" ||
                media.status === "unsupported") && (
                <p
                  className="text-small absolute inset-x-3 bottom-3 rounded-md bg-black/60 px-3 py-2 text-center"
                  role="status"
                >
                  {media.status === "blocked"
                    ? "Your browser is blocking the camera and microphone. Allow them from the address bar, then reload. You can still join."
                    : "This browser can’t check your camera and microphone. You can still join."}
                </p>
              )}
            </div>
            <div className="mt-5 flex items-center justify-center gap-3">
              <RoundButton
                on={media.mic}
                iconOn={Mic}
                iconOff={MicOff}
                label="Microphone"
                onClick={media.toggleMic}
                disabled={media.status !== "ready"}
              />
              <RoundButton
                on={media.cam}
                iconOn={Video}
                iconOff={VideoOff}
                label="Camera"
                onClick={media.toggleCam}
                disabled={media.status !== "ready"}
              />
            </div>
            <div
              className="mx-auto mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-white/15"
              role="meter"
              aria-label="Microphone level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(media.level * 100)}
            >
              <div
                className="h-full rounded-full bg-white/80 transition-[width] duration-75"
                style={{ width: `${Math.round(media.level * 100)}%` }}
              />
            </div>
          </>
        ) : (
          <div className="relative aspect-video overflow-hidden rounded-md bg-black/35 ring-1 ring-white/10">
            {event.coverImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.coverImageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-60"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute inset-x-5 bottom-5">
              <p className="text-small font-semibold">
                You&apos;ll watch the live stream
              </p>
              <p className="text-small text-white/70">
                Camera and mic stay off. Chat, or raise your hand to speak.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div>
          <p className="text-small font-bold tracking-widest text-white/60 uppercase">
            {backstage ? "Backstage" : "Ready to join?"}
          </p>
          <h1 className="text-heading mt-1 leading-tight font-extrabold">
            {event.title}
          </h1>
          <p className="text-body mt-1 text-white/70">
            hosted by {event.organizer.name}
          </p>
          <p className="text-small mt-1 text-white/60">{when}</p>
          <span className="text-small mt-3 inline-flex rounded-full bg-white/15 px-2.5 py-0.5 font-medium">
            Joining as {ROLE_LABEL[role]}
          </span>
        </div>

        {notice && (
          <p
            role="status"
            className="text-small rounded-md bg-[#f59e0b]/20 px-3 py-2 text-white ring-1 ring-[#f59e0b]/50"
          >
            <span className="font-semibold">From the organizer:</span> {notice}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="text-small bg-danger/25 ring-danger/50 rounded-md px-3 py-2 text-white ring-1"
          >
            {error}
          </p>
        )}

        {backstage && (
          <p className="text-small rounded-md bg-white/10 px-3 py-2 text-white/85 ring-1 ring-white/15">
            Attendees can&apos;t see or hear you yet — the room opens to them{" "}
            {`${OPENS_BEFORE_MIN.attendee} minutes`} before the start.
          </p>
        )}

        <button
          type="button"
          onClick={() => void join()}
          disabled={joining}
          className={`${btnLight} w-full`}
        >
          <Icon icon={Video} size="sm" />{" "}
          {joining ? "Joining…" : backstage ? "Enter backstage" : "Join now"}
        </button>

        <p className="text-small text-white/60">
          {onStage
            ? "Check that your camera and microphone work. You can change them once you’re in the room."
            : "Your seat is tied to your registration — sharing this page won’t let anyone else in."}
        </p>
        <Link
          href={`/events/${event.id}`}
          className={btnOnDark}
          onClick={media.stop}
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to event
        </Link>
      </div>
    </main>
  );
}
