"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader } from "lucide-react";
import { Icon } from "@/components/atoms";
import type { WebinarRole } from "@/lib/webinar";
import type { JoinInfo } from "@/lib/api/webinar";
import { withBasePath } from "@/lib/base-path";

// The one place the video provider's room lives. Pages never import vendor
// code: they hand this component what our server issued. Switching VideoSDK for
// another provider touches only this file and the server adapter.
//
// Two shapes, decided by the server (see joinCredential in server/modules/portal/webinar.service):
//  - "watch": a Webinar attendee. They never join the meeting (a meeting token
//    lets its holder publish, proven in the spike), they play the HLS stream.
//  - "room": the host, speakers and Interactive attendees, who join VideoSDK's
//    Prebuilt room (chat, raise hand, screen share, participant list). The
//    server still decides who gets a token: the Prebuilt page is opened with a
//    short-lived token made for this person's registration.

// The Prebuilt version the docs show. Pinned on purpose. The trailing slash is
// required: without it the host answers 302 and drops the whole query string
// (token, room, name), and Prebuilt then fails with error 4001.
const PREBUILT_URL = "https://embed.videosdk.live/rtc-js-prebuilt/0.3.43/";

/** The room id rides in the credential's claims. */
function claimsOf(token: string): { roomId: string } {
  const body = token.split(".")[1] ?? "";
  const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json) as { roomId: string };
}

export function LiveRoom({
  eventId,
  name,
  role,
  notice,
  slidesUrl,
  join,
  refresh,
  recheck,
  onLeave,
}: {
  eventId: string;
  name: string;
  role: WebinarRole;
  /** The host's note and slides, shown while they are on a break. */
  notice?: string;
  slidesUrl?: string;
  join: JoinInfo;
  /** Asks the server again (a watcher polls until the host goes live). */
  refresh: () => Promise<JoinInfo>;
  /** Called when the server refuses a waiting person: the door looks again
   *  (the session may have ended) instead of leaving them on "waiting". */
  recheck: () => void;
  onLeave: () => void;
}) {
  const [current, setCurrent] = useState(join);

  // Interactive attendees wait here until the host has gone live.
  useEffect(() => {
    if (current.mode !== "wait") return;
    let live = true;
    const t = setInterval(() => {
      void refresh()
        .then((r) => live && r.mode !== "wait" && setCurrent(r))
        .catch(() => live && recheck());
    }, 6000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [current.mode, refresh, recheck]);

  // The Prebuilt room takes the whole screen: its own control bar, chat,
  // participant list and layouts need the room, and it has its own Leave.
  if (current.mode === "room")
    return (
      <PrebuiltRoom
        credential={current.credential}
        name={name}
        role={role}
        viewer={!!current.viewer}
      />
    );

  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 gap-4 px-4 pb-10 sm:px-6">
      {current.mode === "wait" ? (
        <Waiting
          title="The host isn't live right now"
          body="The session hasn't started, or the host is on a short break. This page lets you in by itself the moment they are back."
          notice={notice}
          slidesUrl={slidesUrl}
        />
      ) : current.mode === "watch" ? (
        <Watcher initial={current} refresh={refresh} />
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onLeave}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-white/25 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          <Icon icon={ArrowLeft} size="sm" /> Leave
        </button>
        <Link
          href={`/${eventId}`}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-white/25 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          Back to event
        </Link>
      </div>
    </main>
  );
}

function Waiting({
  title,
  body,
  notice,
  slidesUrl,
}: {
  title: string;
  body: string;
  notice?: string;
  slidesUrl?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex min-h-[55vh] w-full max-w-xl flex-col items-center justify-center gap-5 py-10 text-center"
    >
      <span className="relative flex size-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-white/15" />
        <span className="relative flex size-20 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/25">
          <Icon icon={Loader} size="lg" className="animate-spin text-white" />
        </span>
      </span>
      <h1 className="text-display leading-tight font-extrabold text-white">
        {title}
      </h1>
      <p className="text-body max-w-md text-white/75">{body}</p>
      {notice && (
        <p className="text-body w-full rounded-md bg-white/10 p-4 text-left text-white ring-1 ring-white/15">
          <span className="text-small mb-1 block font-bold tracking-widest text-white/60 uppercase">
            Note from the host
          </span>
          {notice}
        </p>
      )}
      {slidesUrl && (
        <a
          href={slidesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary inline-flex h-10 items-center rounded-sm bg-white px-4 text-sm font-semibold shadow-sm transition-colors hover:bg-white/90"
        >
          Open the slides while you wait
        </a>
      )}
    </div>
  );
}

/** Attendee on a Webinar: plays the stream, never joins the meeting. */
function Watcher({
  initial,
  refresh,
}: {
  initial: Extract<JoinInfo, { mode: "watch" }>;
  refresh: () => Promise<JoinInfo>;
}) {
  const [url, setUrl] = useState(initial.watchUrl);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  // Until the host goes live there is no address: ask again every few seconds.
  useEffect(() => {
    if (url) return;
    let live = true;
    const t = setInterval(() => {
      void refresh()
        .then((r) => {
          if (live && r.mode === "watch" && r.watchUrl) setUrl(r.watchUrl);
        })
        .catch(() => undefined);
    }, 8000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [url, refresh]);

  useEffect(() => {
    const el = video.current;
    if (!url || !el) return;
    let hls: { destroy: () => void } | null = null;
    let gone = false;
    void import("hls.js").then(({ default: Hls }) => {
      if (gone) return;
      if (Hls.isSupported()) {
        const h = new Hls({ lowLatencyMode: true });
        h.on(Hls.Events.ERROR, (_e, d) => d.fatal && setFailed(true));
        h.loadSource(url);
        h.attachMedia(el);
        hls = h;
      } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = url; // iPhone Safari has no MSE but plays HLS itself
      } else {
        setFailed(true);
      }
    });
    void el.play().catch(() => undefined);
    return () => {
      gone = true;
      hls?.destroy();
    };
  }, [url]);

  if (!url)
    return (
      <Waiting
        title="Waiting for the host"
        body="The session hasn't gone live yet. This page starts the stream by itself as soon as it does."
      />
    );
  if (failed)
    return (
      <Waiting
        title="Can't play the stream"
        body="Your browser couldn't play it. Try another browser, or reload the page."
      />
    );
  return (
    <video
      ref={video}
      controls
      playsInline
      autoPlay
      className="aspect-video w-full rounded-md bg-black"
    />
  );
}

/**
 * Prebuilt's options, as the embed page reads them from its query string (the
 * names are the ones in its bundle; the docs list some under other names).
 * Our own lobby has already checked the camera and microphone, so Prebuilt's
 * join screen is skipped. What each role may do mirrors what the server lets
 * their token do: the host moderates, speakers present, attendees take part.
 * Ending the session, recording and the HLS stream stay with our server, so
 * those controls are off here.
 */
function roomOptions(
  role: WebinarRole,
  origin: string,
  viewer: boolean,
): Record<string, string> {
  const host = role === "host";
  const presenter = host || role === "speaker";
  const b = (v: boolean) => String(v);
  // A Webinar attendee: a signalling-only viewer. Prebuilt plays the host's
  // HLS stream for them, with chat, polls and raise hand, and no mic, camera
  // or screen share.
  const viewing: Record<string, string> = viewer
    ? {
        mode: "SIGNALLING_ONLY",
        micEnabled: "false",
        webcamEnabled: "false",
        participantCanToggleSelfMic: "false",
        participantCanToggleSelfWebcam: "false",
        hlsEnabled: "true",
        hlsPlayerControlsVisible: "true",
        hlsTheme: "DARK",
      }
    : {};
  return {
    // Look
    theme: "DARK",
    language: "en",
    brandingEnabled: "true",
    brandName: "GCODE Events",
    // The square GCODE mark: Prebuilt shows the logo in a small round slot, so
    // the wide wordmark (app-logo.png) would be squeezed.
    brandLogoURL: `${origin}${withBasePath("/apple-icon.png")}`,
    poweredBy: "false",
    topbarEnabled: "true",
    layoutType: "SIDEBAR",
    layoutPriority: "SPEAKER",
    layoutGridSize: "9",
    maintainVideoAspectRatio: "true",
    animationsEnabled: "true",
    waitingScreenText: "Connecting you to the session...",
    // Joining: our lobby already did it, so Prebuilt's device-check screen
    // and its "Join the meeting" button are both skipped. If a browser with no
    // camera sits on "Connecting", set joinWithoutUserInteraction back to
    // "false" (that is what showed the button).
    joinScreenEnabled: "false",
    joinWithoutUserInteraction: "true",
    askJoin: "false",
    // Everyone
    chatEnabled: "true",
    raiseHandEnabled: "true",
    pollEnabled: "true",
    participantTabPanelEnabled: "true",
    moreOptionsEnabled: "true",
    participantCanLeave: "true",
    participantCanToggleSelfMic: "true",
    participantCanToggleSelfWebcam: "true",
    notificationSoundEnabled: "true",
    notificationAlertsEnabled: "true",
    participantNotificationAlertsEnabled: "true",
    maxResolution: "hd",
    // By role
    screenShareEnabled: b(presenter),
    canPin: b(presenter),
    canChangeLayout: b(presenter),
    canCreatePoll: b(presenter),
    canToggleVirtualBackground: "true",
    whiteboardEnabled: "false",
    participantCanToggleOtherMic: b(host),
    participantCanToggleOtherWebcam: b(host),
    partcipantCanToogleOtherScreenShare: b(host),
    canRemoveOtherParticipant: b(host),
    // Ours: the server ends the session and starts recording and the stream
    participantCanEndMeeting: "false",
    recordingEnabled: "false",
    participantCanToggleRecording: "false",
    participantCanToggleHls: "false",
    liveStreamEnabled: "false",
    hlsEnabled: "false",
    ...viewing,
  };
}

/**
 * VideoSDK's Prebuilt room, full screen. The URL carries a token our server
 * made for this person (it holds the room id and their registration as the
 * participant id), so nobody joins without a ticket.
 */
function PrebuiltRoom({
  credential,
  name,
  role,
  viewer,
}: {
  credential: string;
  name: string;
  role: WebinarRole;
  viewer: boolean;
}) {
  let src: string | null = null;
  try {
    const { roomId } = claimsOf(credential);
    const q = new URLSearchParams({
      token: credential,
      meetingId: roomId,
      name,
      micEnabled: "true",
      webcamEnabled: "true",
      // Leaving, or being removed when the host ends the stream, lands back
      // on this page: the door then shows the waiting room or the ended page.
      redirectOnLeave: window.location.href,
      ...roomOptions(role, window.location.origin, viewer),
    });
    src = `${PREBUILT_URL}?${q}`;
  } catch {
    src = null;
  }
  if (!src)
    return (
      <Waiting
        title="Couldn't open the room"
        body="Reload the page and try again."
      />
    );
  return (
    <iframe
      src={src}
      title="Live session"
      allow="camera; microphone; display-capture; fullscreen; autoplay; clipboard-write"
      className="fixed inset-0 z-50 size-full border-0 bg-black"
    />
  );
}
