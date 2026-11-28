// Webinar (online / hybrid events): the "GCODE Live room". Provider-neutral:
// organizers and attendees never see the video vendor's name, and no page
// imports vendor code (see components/live-room.tsx).
//
// What lives here is only what both the organizer page and the attendee door
// need: types, timing rules, and the role table. Everything that depends on a
// person (role, whether they are registered, whether the room is open) comes
// from the server (lib/api/webinar.ts), never from the browser.
//
//  - One door: /<id>/live. Vendor links are never emailed.
//  - The server decides the viewer's role and the room state. Going live and
//    ending the session are server flags set by the host's actions.
//  - "Join" asks our server for a short-lived credential tied to the viewer's
//    registration, so a forwarded link gets nobody in.
//  - Viewer mode in a Prebuilt room is HLS: a few seconds behind the stage,
//    not "near-zero delay".

export type WebinarRole = "host" | "speaker" | "attendee";

/** EARLY: not open yet · BACKSTAGE: speakers only · OPEN: everyone · ENDED: replay. */
export type WebinarState = "EARLY" | "BACKSTAGE" | "OPEN" | "ENDED";

export const ROLE_LABEL: Record<WebinarRole, string> = {
  host: "Host",
  speaker: "Speaker",
  attendee: "Attendee",
};

/** What each role may do in the room (mapped onto each provider's roles). */
export const ROLE_CAN: Record<
  WebinarRole,
  { publish: boolean; moderate: boolean; record: boolean; endForAll: boolean }
> = {
  host: { publish: true, moderate: true, record: true, endForAll: true },
  speaker: { publish: true, moderate: false, record: false, endForAll: false },
  attendee: {
    publish: false,
    moderate: false,
    record: false,
    endForAll: false,
  },
};

/**
 * Room size comes from the provider plan in use, so it is configuration the
 * server reports (see WebinarSettings.roomLimit), not a constant. These are
 * the Free-plan numbers, used only until the server says otherwise.
 */
export const DEFAULT_ROOM_LIMIT = { interactive: 50, webinarViewers: 100 };

/** Minutes before the start that each role can get in. */
export const OPENS_BEFORE_MIN: Record<WebinarRole, number> = {
  host: 30,
  speaker: 30,
  attendee: 15,
};
/** The room closes this long after the scheduled end. */
export const CLOSES_AFTER_MIN = 15;

export interface Speaker {
  id: string;
  name: string;
  title: string;
  role: Exclude<WebinarRole, "attendee">;
  inviteStatus: "accepted" | "pending";
}

/** What the organizer sets. Room-shaping fields lock once doors open. */
export interface WebinarConfig {
  /** Interactive = everyone in the call; "livestream" = speakers on stage,
   *  attendees watch (HLS) and chat. */
  audience: "interactive" | "livestream";
  recording: boolean;
  chat: boolean;
  handRaise: boolean;
  captions: boolean;
  /** Short notice shown on the event page and the door. */
  notice?: string;
  /** Optional copy of the stream to YouTube etc. */
  restreamUrl?: string;
  slidesUrl?: string;
  /** Replay visible to registrants (server returns the URL only to them). */
  replayPublished: boolean;
}

/** What the provider reported back. Only the server changes these. */
export interface WebinarStatus {
  live: boolean;
  recording: boolean;
  ended: boolean;
  /** A recording exists and is stored (the URL itself is never sent here). */
  recordingReady: boolean;
}

/** What the active provider supports, so the UI shows only real controls. */
export interface WebinarCapabilities {
  pause: boolean;
  notice: boolean;
  captions: boolean;
  restream: boolean;
}

export interface WebinarSettings {
  config: WebinarConfig;
  status: WebinarStatus;
  capabilities: WebinarCapabilities;
  roomLimit: { interactive: number; webinarViewers: number };
  speakers: Speaker[];
}

export const DEFAULT_WEBINAR: WebinarSettings = {
  config: {
    audience: "livestream",
    recording: true,
    chat: true,
    handRaise: true,
    captions: false,
    replayPublished: false,
  },
  status: {
    live: false,
    recording: false,
    ended: false,
    recordingReady: false,
  },
  capabilities: {
    pause: false,
    notice: true,
    captions: false,
    restream: false,
  },
  roomLimit: DEFAULT_ROOM_LIMIT,
  speakers: [],
};

/**
 * Where the session is, from the organizer's side. Settings that shape the
 * room itself lock at "doors": the provider applies the room template when the
 * session starts.
 */
export type WebinarPhase = "setup" | "doors" | "live" | "after";

/**
 * The phase follows the clock, moved on by the server's own flags: going live
 * and ending are the host's actions, not something the browser decides.
 * `now` must come from the server-time helper, never `new Date()` alone.
 */
export function webinarPhase(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  status: Pick<WebinarStatus, "live" | "ended">,
  now: Date,
): WebinarPhase {
  if (status.ended) return "after";
  const state = webinarState(startIso, endIso, "host", now);
  if (state === "ENDED") return "after";
  if (status.live) return "live";
  if (state === "EARLY") return "setup";
  return "doors";
}

/**
 * The door state for a role at a moment. The server is the authority (it also
 * returns this from live-access); the client uses it to render countdowns and
 * to double-check the server's answer against the clock it was given.
 */
export function webinarState(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  role: WebinarRole,
  now: Date,
): WebinarState {
  if (!startIso) return "EARLY";
  const start = new Date(startIso).getTime();
  const end = new Date(endIso ?? startIso).getTime();
  const t = now.getTime();
  if (t > end + CLOSES_AFTER_MIN * 60_000) return "ENDED";
  if (t >= start - OPENS_BEFORE_MIN.attendee * 60_000) return "OPEN";
  if (role !== "attendee" && t >= start - OPENS_BEFORE_MIN[role] * 60_000)
    return "BACKSTAGE";
  return "EARLY";
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
