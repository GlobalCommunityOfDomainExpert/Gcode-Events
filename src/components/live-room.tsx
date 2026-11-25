"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader } from "lucide-react";
import { Icon } from "@/components/atoms";
import type { JoinInfo } from "@/lib/api/webinar";

// The one place the video provider's room lives. Pages never import vendor
// code: they hand this component what our server issued. Switching VideoSDK for
// another provider touches only this file and the server adapter.
//
// Two shapes, decided by the server (see joinCredential in server/portal/live):
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
  join,
  refresh,
  onLeave,
}: {
  eventId: string;
  name: string;
  join: JoinInfo;
  /** Asks the server again (a watcher polls until the host goes live). */
  refresh: () => Promise<JoinInfo>;
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
        .catch(() => undefined);
    }, 6000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [current.mode, refresh]);

  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 gap-4 px-4 pb-10 sm:px-6">
      {current.mode === "wait" ? (
        <Waiting
          title="Waiting for the host"
          body="The host has not started the session yet. You will be let in by itself as soon as they do."
        />
      ) : current.mode === "watch" ? (
        <Watcher initial={current} refresh={refresh} />
      ) : (
        <PrebuiltRoom
          eventId={eventId}
          credential={current.credential}
          name={name}
        />
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onLeave}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-white/25 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          <Icon icon={ArrowLeft} size="sm" /> Leave
        </button>
        <Link
          href={`/events/${eventId}`}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-white/25 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          Back to event
        </Link>
      </div>
    </main>
  );
}

function Waiting({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-xl space-y-3 py-10">
      <p className="text-small flex items-center gap-2 font-bold tracking-widest text-white/60 uppercase">
        <Icon icon={Loader} size="sm" className="size-4" /> {title}
      </p>
      <p className="text-body text-white/70">{body}</p>
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
 * VideoSDK's Prebuilt room in an iframe. The URL carries a token our server
 * made for this person (it holds the room id and their registration as the
 * participant id), so nobody joins without a ticket. Chat, raise hand, screen
 * share and the participant list come from Prebuilt itself.
 */
function PrebuiltRoom({
  eventId,
  credential,
  name,
}: {
  eventId: string;
  credential: string;
  name: string;
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
      chatEnabled: "true",
      raiseHandEnabled: "true",
      screenShareEnabled: "true",
      redirectOnLeave: `${window.location.origin}/events/${eventId}`,
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
      className="h-[75vh] min-h-[420px] w-full rounded-md border-0 bg-black"
    />
  );
}
