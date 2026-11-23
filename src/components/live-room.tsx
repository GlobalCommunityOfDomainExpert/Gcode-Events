"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Icon } from "@/components/atoms";
import type { WebinarRole } from "@/lib/webinar";
import type { JoinInfo } from "@/lib/api/webinar";

// The one place the video provider's room lives. Pages never import vendor
// code: they hand this component what our server issued and a role. Switching
// VideoSDK for another provider touches only this file and the server adapter.
//
// Two shapes, decided by the server (see joinCredential in server/portal/live):
//  - "watch": a Webinar attendee. They never join the meeting (a meeting token
//    lets its holder publish, proven in the spike), they play the HLS stream.
//  - "room": the host or a speaker, who publish through the SDK.

// The SDK version the spike ran against. Pinned on purpose.
const SDK_URL = "https://sdk.videosdk.live/js-sdk/0.3.0/videosdk.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sdk = any;

function loadSdk(): Promise<Sdk> {
  const w = window as unknown as { VideoSDK?: Sdk };
  if (w.VideoSDK) return Promise.resolve(w.VideoSDK);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () =>
      w.VideoSDK ? resolve(w.VideoSDK) : reject(new Error("No video SDK"));
    s.onerror = () => reject(new Error("Couldn't load the video SDK"));
    document.head.appendChild(s);
  });
}

/** The room id and our participant id ride in the credential's claims. */
function claimsOf(token: string): { roomId: string; participantId: string } {
  const body = token.split(".")[1] ?? "";
  const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json) as { roomId: string; participantId: string };
}

export function LiveRoom({
  eventId,
  role,
  name,
  join,
  refresh,
  onLeave,
}: {
  eventId: string;
  role: WebinarRole;
  name: string;
  join: JoinInfo;
  /** Asks the server again (a watcher polls until the host goes live). */
  refresh: () => Promise<JoinInfo>;
  onLeave: () => void;
}) {
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 gap-4 px-4 pb-10 sm:px-6">
      {join.mode === "watch" ? (
        <Watcher initial={join} refresh={refresh} />
      ) : (
        <Publisher credential={join.credential} name={name} role={role} />
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

interface Tile {
  id: string;
  name: string;
  stream: MediaStream | null;
  self: boolean;
}

/** Host or speaker: publishes through the SDK. */
function Publisher({
  credential,
  name,
  role,
}: {
  credential: string;
  name: string;
  role: WebinarRole;
}) {
  const [state, setState] = useState<"joining" | "in" | "error">("joining");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const meeting = useRef<Sdk>(null);

  useEffect(() => {
    let gone = false;
    const streams = new Map<string, MediaStreamTrack[]>();
    const push = (id: string, label: string, self: boolean) => {
      const tracks = streams.get(id) ?? [];
      const stream = tracks.length ? new MediaStream(tracks) : null;
      setTiles((all) => [
        ...all.filter((t) => t.id !== id),
        { id, name: label, stream, self },
      ]);
    };
    const track = (id: string, label: string, self: boolean, s: Sdk) => {
      const list = (streams.get(id) ?? []).filter(
        (t) => t.kind !== s.track.kind,
      );
      streams.set(id, [...list, s.track]);
      push(id, label, self);
    };
    const untrack = (
      id: string,
      label: string,
      self: boolean,
      kind: string,
    ) => {
      streams.set(
        id,
        (streams.get(id) ?? []).filter((t) => t.kind !== kind),
      );
      push(id, label, self);
    };

    void (async () => {
      try {
        const { roomId, participantId } = claimsOf(credential);
        const sdk = await loadSdk();
        if (gone) return;
        sdk.config(credential);
        const m = sdk.initMeeting({
          meetingId: roomId,
          name,
          participantId,
          micEnabled: true,
          webcamEnabled: true,
          mode: "SEND_AND_RECV",
        });
        meeting.current = m;
        const watch = (p: Sdk, self: boolean) => {
          push(p.id, p.displayName ?? p.id, self);
          p.on("stream-enabled", (s: Sdk) =>
            track(p.id, p.displayName ?? p.id, self, s),
          );
          p.on("stream-disabled", (s: Sdk) =>
            untrack(p.id, p.displayName ?? p.id, self, s.kind),
          );
        };
        m.on("meeting-joined", () => {
          if (gone) return;
          setState("in");
          watch(m.localParticipant, true);
        });
        m.on("participant-joined", (p: Sdk) => watch(p, false));
        m.on("participant-left", (p: Sdk) =>
          setTiles((all) => all.filter((t) => t.id !== p.id)),
        );
        m.on("error", () => !gone && setState("error"));
        m.join();
      } catch {
        if (!gone) setState("error");
      }
    })();

    return () => {
      gone = true;
      try {
        meeting.current?.leave();
      } catch {
        /* already gone */
      }
    };
  }, [credential, name]);

  if (state === "error")
    return (
      <Waiting
        title="Couldn't open the room"
        body="Check that your camera and microphone are allowed, then reload the page."
      />
    );
  if (state === "joining")
    return <Waiting title="Joining" body="Connecting you to the room…" />;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((t) => (
          <TileView key={t.id} tile={t} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={!mic}
          onClick={() => {
            if (mic) meeting.current?.muteMic();
            else meeting.current?.unmuteMic();
            setMic(!mic);
          }}
          className="inline-flex h-9 items-center gap-2 rounded-sm border border-white/25 px-3 text-sm font-semibold text-white hover:bg-white/10"
        >
          <Icon icon={mic ? Mic : MicOff} size="sm" /> {mic ? "Mute" : "Unmute"}
        </button>
        <button
          type="button"
          aria-pressed={!cam}
          onClick={() => {
            if (cam) meeting.current?.disableWebcam();
            else meeting.current?.enableWebcam();
            setCam(!cam);
          }}
          className="inline-flex h-9 items-center gap-2 rounded-sm border border-white/25 px-3 text-sm font-semibold text-white hover:bg-white/10"
        >
          <Icon icon={cam ? Video : VideoOff} size="sm" />{" "}
          {cam ? "Camera off" : "Camera on"}
        </button>
        <span className="text-xs text-white/60">
          You are {role === "host" ? "the host" : "a speaker"}
        </span>
      </div>
    </div>
  );
}

function TileView({ tile }: { tile: Tile }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = tile.stream;
  }, [tile.stream]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-md bg-black">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={tile.self}
        className="size-full object-cover"
      />
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {tile.self ? "You" : tile.name}
      </span>
    </div>
  );
}
