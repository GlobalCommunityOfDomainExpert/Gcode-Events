import { createHmac, timingSafeEqual } from "node:crypto";
import * as db from "./ords";
import { badRequest, forbidden, HttpError, notFound } from "./http";
import {
  getEvent,
  isManager,
  utcMs,
  requireManager,
  type EventRow,
} from "./access";
import * as provider from "./provider";
import type { LiveKind, NormalizedEvent, OurRole } from "./provider";
import { CLOSES_AFTER_MIN, webinarState } from "@/lib/webinar";
import { uploadRecordingObject } from "@/lib/oci/object-storage";

// The live room's decisions: who may enter and as what, the door state on the
// server clock, host actions run against the provider, attendance and
// recordings from provider events. APEX only stores the rows.

export interface WebinarRow extends db.Row {
  event_id: number;
  audience: "interactive" | "livestream";
  recording: number;
  chat: number;
  hand_raise: number;
  captions: number;
  notice: string | null;
  restream_url: string | null;
  slides_url: string | null;
  replay_published: number;
  is_live: number;
  is_recording: number;
  is_ended: number;
  provider: string;
  room_ref: string | null;
  recording_url: string | null;
  hls_url: string | null;
}

interface PartRow extends db.Row {
  id: number;
  user_id: string | null;
  active: string;
  full_name: string | null;
}
interface PanelistRow extends db.Row {
  id: number;
  user_id: string | null;
  invited_email: string;
  status: string;
  panelist_role: string | null;
  full_name: string | null;
}

// ----------------------------------------------------------------- basics
async function webinarRow(eventId: number): Promise<WebinarRow> {
  const existing = await db.first<WebinarRow>("portal_webinar", {
    event_id: eventId,
  });
  if (existing) return existing;
  try {
    await db.insert("portal_webinar", { event_id: eventId });
  } catch (e) {
    if (!(e instanceof HttpError && e.status === 409)) throw e; // raced: fine
  }
  const row = await db.first<WebinarRow>("portal_webinar", {
    event_id: eventId,
  });
  if (!row) throw new Error("webinar row missing after insert");
  return row;
}

const iso = (ms: number | null) =>
  ms === null ? null : new Date(ms).toISOString();

/** The registration id of a signed-in ticket holder, or 0. */
async function registrationOf(
  eventId: number,
  userId: string | null,
): Promise<number> {
  if (!userId) return 0;
  const parts = await db.list<PartRow>("portal_v_participants", {
    event_id: eventId,
  });
  return parts.find((p) => p.user_id === userId && p.active === "Y")?.id ?? 0;
}

async function roleOf(ev: EventRow, userId: string | null): Promise<OurRole> {
  if (!userId) return "attendee";
  if (await isManager(ev, userId)) return "host";
  const ps = await db.list<PanelistRow>("portal_v_panelists", {
    event_id: ev.id,
  });
  return ps.some(
    (p) =>
      p.user_id === userId &&
      p.status === "ACCEPTED" &&
      p.panelist_role === "SPEAKER",
  )
    ? "speaker"
    : "attendee";
}

const stateOf = (ev: EventRow, role: OurRole, now = new Date()) =>
  webinarState(iso(utcMs(ev.start_ist)), iso(utcMs(ev.end_ist)), role, now);

const flag = (b: unknown): number | undefined =>
  b === undefined ? undefined : b ? 1 : 0;

// -------------------------------------------------- organizer: settings
export async function getSettings(eventId: number, userId: string) {
  const ev = await requireManager(eventId, userId);
  const w = await webinarRow(eventId);
  const ps = await db.list<PanelistRow>("portal_v_panelists", {
    event_id: eventId,
  });
  const speakers = [
    {
      id: "host",
      name: ev.organizer_name ?? "Host",
      title: "Host",
      role: "HOST",
      invite_status: "ACCEPTED",
    },
    ...ps
      .filter(
        (p) =>
          p.panelist_role === "SPEAKER" &&
          (p.status === "INVITED" || p.status === "ACCEPTED"),
      )
      .map((p) => ({
        id: p.id,
        name: p.full_name ?? p.invited_email,
        title: "Speaker",
        role: "SPEAKER",
        invite_status: p.status === "ACCEPTED" ? "ACCEPTED" : "PENDING",
      })),
  ];
  return {
    audience: w.audience,
    recording: !!w.recording,
    chat: !!w.chat,
    hand_raise: !!w.hand_raise,
    captions: !!w.captions,
    notice: w.notice,
    restream_url: w.restream_url,
    slides_url: w.slides_url,
    replay_published: !!w.replay_published,
    status: {
      live: !!w.is_live,
      recording: !!w.is_recording,
      ended: !!w.is_ended,
      recording_ready: !!w.recording_url,
    },
    capabilities: provider.capabilities(),
    room_limit: {
      interactive: Number(process.env.ROOM_LIMIT_INTERACTIVE ?? 50),
      webinar_viewers: Number(process.env.ROOM_LIMIT_VIEWERS ?? 100),
    },
    speakers,
  };
}

export async function saveSettings(
  eventId: number,
  userId: string,
  b: Record<string, unknown>,
) {
  const ev = await requireManager(eventId, userId);
  const w = await webinarRow(eventId);
  const shaping = ["audience", "recording", "chat", "hand_raise"].some(
    (k) => b[k] !== undefined,
  );
  // The provider builds the room from these when the session starts.
  if (
    shaping &&
    (w.is_live || w.is_ended || stateOf(ev, "attendee") !== "EARLY")
  )
    throw badRequest("Room settings are locked once doors are open");
  if (
    b.audience !== undefined &&
    !["interactive", "livestream"].includes(String(b.audience))
  )
    throw badRequest("Unknown format");
  if (
    typeof b.slides_url === "string" &&
    b.slides_url &&
    !/^https:\/\//i.test(b.slides_url)
  )
    throw badRequest("The slides link must start with https://");
  const next: WebinarRow = {
    ...w,
    audience: (b.audience as WebinarRow["audience"]) ?? w.audience,
    recording: flag(b.recording) ?? w.recording,
    chat: flag(b.chat) ?? w.chat,
    hand_raise: flag(b.hand_raise) ?? w.hand_raise,
    captions: flag(b.captions) ?? w.captions,
    replay_published: flag(b.replay_published) ?? w.replay_published,
    notice:
      "notice" in b
        ? String(b.notice ?? "")
            .trim()
            .slice(0, 120) || null
        : w.notice,
    restream_url:
      "restream_url" in b
        ? String(b.restream_url ?? "").slice(0, 500) || null
        : w.restream_url,
    slides_url:
      "slides_url" in b
        ? String(b.slides_url ?? "").slice(0, 500) || null
        : w.slides_url,
    updated_on: db.ts(),
  };
  await db.replace("portal_webinar", eventId, next);
}

// --------------------------------------------------------- the door
/** Short-lived, ticket-bound URL for the replay video (a <video> tag cannot send a bearer token). */
function replaySecret() {
  const s = process.env.REPLAY_SECRET ?? process.env.ORDS_PORTAL_KEY;
  if (!s) throw new Error("REPLAY_SECRET is not set");
  return s;
}
function replaySig(eventId: number, exp: number, userId: string) {
  return createHmac("sha256", replaySecret())
    .update(`${eventId}.${exp}.${userId}`)
    .digest("hex");
}
export function replayUrl(eventId: number, userId: string) {
  const exp = Math.floor(Date.now() / 1000) + 2 * 3600;
  return `/api/portal/events/${eventId}/replay?u=${encodeURIComponent(userId)}&e=${exp}&s=${replaySig(eventId, exp, userId)}`;
}
export function checkReplaySig(
  eventId: number,
  u: string,
  e: number,
  s: string,
) {
  if (!u || !e || e < Date.now() / 1000) return false;
  const want = Buffer.from(replaySig(eventId, e, u));
  const got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function liveAccess(eventId: number, userId: string | null) {
  const ev = await getEvent(eventId);
  const w = await webinarRow(eventId);
  const role = await roleOf(ev, userId);
  const reg = await registrationOf(eventId, userId);
  const state = stateOf(ev, role);
  const holder = reg > 0 || role !== "attendee";
  // The recording URL is returned only to ticket holders, and only once it is
  // published and stored in our own bucket (D6).
  const replay =
    userId &&
    holder &&
    state === "ENDED" &&
    w.replay_published &&
    w.recording_url
      ? { url: replayUrl(eventId, userId), slides_url: w.slides_url }
      : undefined;
  return {
    registered: holder,
    role: role.toUpperCase(),
    state,
    live: !!w.is_live,
    notice: w.notice,
    replay,
  };
}

/** A join credential for this viewer, or a 403. Tied to their registration. */
export async function joinCredential(eventId: number, userId: string) {
  const ev = await getEvent(eventId);
  const role = await roleOf(ev, userId);
  const reg = await registrationOf(eventId, userId);
  if (role === "attendee" && reg === 0)
    throw forbidden("You need a ticket to join this session");
  const w = await webinarRow(eventId);
  const state = stateOf(ev, role);
  if (w.is_ended || state === "EARLY" || state === "ENDED")
    throw forbidden("The room is not open for you right now");
  if (reg > 0) {
    const blocks = await db.list<db.Row>("portal_live_blocks", {
      event_id: eventId,
    });
    if (blocks.some((b) => b.participant_id === reg))
      throw forbidden("You were removed from this session");
  }
  // Webinar format: attendees only watch. Proven in the spike that anyone
  // holding a meeting token can switch their mode and publish audio and video,
  // so an attendee never gets one. They get the stream address instead, and
  // only while the host is live.
  if (role === "attendee" && w.audience === "livestream")
    return {
      mode: "watch" as const,
      watchUrl: w.is_live ? w.hls_url : null,
    };
  const room = await ensureRoom(w, ev);
  const end = (utcMs(ev.end_ist) ?? Date.now()) + CLOSES_AFTER_MIN * 60_000;
  // Short expiry: until the room closes plus 15 minutes, never over 12 hours.
  const ttl = Math.min(
    12 * 3600,
    Math.max(900, Math.round((end - Date.now()) / 1000) + 900),
  );
  const pid = role === "attendee" ? String(reg) : `u${userId}`;
  return {
    mode: "room" as const,
    credential: provider.credentialFor(room, role, pid, ttl),
  };
}

/** The provider room is created this long before the start, never earlier. */
export const ROOM_OPENS_BEFORE_MIN = 5;

/**
 * Saving settings never touches the provider. The room is created on first
 * need, and only once the session is within ROOM_OPENS_BEFORE_MIN of starting
 * (or later), so no room exists for an event that is still days away.
 */
async function ensureRoom(w: WebinarRow, ev: EventRow): Promise<string> {
  if (w.room_ref) return w.room_ref;
  const start = utcMs(ev.start_ist);
  if (start !== null && Date.now() < start - ROOM_OPENS_BEFORE_MIN * 60_000)
    throw forbidden(
      `The room is set up ${ROOM_OPENS_BEFORE_MIN} minutes before the start. Come back then`,
    );
  const room = await provider.createRoom();
  await db.replace("portal_webinar", w.event_id, { ...w, room_ref: room });
  w.room_ref = room;
  return room;
}

// ----------------------------------------------------- host actions
export type HostAction =
  "go-live" | "stop" | "record" | "captions" | "notice" | "end";

/**
 * The host's actions run against the provider FROM THE SERVER (D15), and the
 * matching flag is set only when that call succeeds. Provider webhooks
 * correct the flags afterwards (a failed stream flips them back).
 */
export async function hostAction(
  eventId: number,
  userId: string,
  action: HostAction,
  b: Record<string, unknown>,
  origin: string,
) {
  const ev = await getEvent(eventId);
  if ((await roleOf(ev, userId)) !== "host")
    throw forbidden("Only the host or organizer can do this");
  let w = await webinarRow(eventId);
  const hook = `${origin}/api/portal/webhooks/live`;
  const save = async (patch: Partial<WebinarRow>) => {
    w = { ...w, ...patch, updated_on: db.ts() };
    await db.replace("portal_webinar", eventId, w);
  };

  if (action === "notice") {
    await save({
      notice:
        String(b.text ?? "")
          .trim()
          .slice(0, 120) || null,
    });
    return;
  }
  if (action === "captions")
    throw badRequest("Live captions are not available with this room");
  if (w.is_ended) throw badRequest("This session has ended");

  // Only go-live may create the room. Anything else with no room has nothing
  // to act on, so it must not make one.
  if (action !== "go-live" && !w.room_ref)
    throw badRequest("The room has not been set up yet");
  const room = await ensureRoom(w, ev);
  if (action === "go-live") {
    if (w.is_live) return;
    let hls: string | null = null;
    if (w.audience === "livestream")
      hls = await provider.startStream(room, hook);
    let recording = 0;
    if (w.recording) {
      await provider.startRecording(room, hook);
      recording = 1;
    }
    await save({ is_live: 1, is_recording: recording, hls_url: hls });
  } else if (action === "stop") {
    if (w.audience === "livestream") await provider.stopStream(room);
    await save({ is_live: 0, hls_url: null });
  } else if (action === "record") {
    const on = b.enabled === true || b.enabled === "true";
    if (on && !w.is_recording) await provider.startRecording(room, hook);
    if (!on && w.is_recording) await provider.stopRecording(room);
    await save({ is_recording: on ? 1 : 0 });
  } else if (action === "end") {
    if (w.is_recording) await provider.stopRecording(room).catch(() => {});
    await provider.endRoom(room);
    await save({ is_live: 0, is_recording: 0, is_ended: 1, hls_url: null });
  }
}

export async function removeFromRoom(
  eventId: number,
  userId: string,
  registrationId: number,
) {
  const ev = await getEvent(eventId);
  if ((await roleOf(ev, userId)) !== "host")
    throw forbidden("Only the host or organizer can do this");
  const parts = await db.list<PartRow>("portal_v_participants", {
    event_id: eventId,
  });
  if (!parts.some((p) => p.id === registrationId))
    throw notFound("Participant not found");
  try {
    await db.insert("portal_live_blocks", {
      event_id: eventId,
      participant_id: registrationId,
    });
  } catch (e) {
    if (!(e instanceof HttpError && e.status === 409)) throw e;
  }
  const w = await webinarRow(eventId);
  // Blocking new credentials is what matters; the kick is best effort.
  if (w.room_ref)
    await provider
      .removePerson(w.room_ref, String(registrationId))
      .catch(() => {});
}

// --------------------------------------------------- provider events
interface AttendanceRow extends db.Row {
  id: number;
  event_id: number;
  participant_id: number;
  first_joined: string | null;
  last_joined: string | null;
  last_left: string | null;
  seconds_in: number;
}

/** Applies one provider event, once. A replayed event hits the unique key. */
export async function applyProviderEvent(ev: NormalizedEvent) {
  const w = await db.first<WebinarRow>("portal_webinar", {
    room_ref: ev.roomId,
  });
  if (!w) return; // not one of our rooms
  const participant =
    ev.participantId && /^\d+$/.test(ev.participantId)
      ? Number(ev.participantId)
      : undefined;
  try {
    await db.insert("portal_live_events", {
      event_id: w.event_id,
      provider_event_id: ev.providerEventId.slice(0, 200),
      kind: ev.kind,
      participant_id: participant ?? null,
    });
  } catch (e) {
    if (e instanceof HttpError && e.status === 409) return; // already applied
    throw e;
  }
  const set = (patch: Partial<WebinarRow>) =>
    db.replace("portal_webinar", w.event_id, {
      ...w,
      ...patch,
      updated_on: db.ts(),
    });
  const kind: LiveKind = ev.kind;
  if (kind === "live_started") await set({ is_live: 1 });
  else if (kind === "live_stopped") await set({ is_live: 0, hls_url: null });
  else if (kind === "recording_started") await set({ is_recording: 1 });
  else if (kind === "failed")
    await set({ is_live: 0, is_recording: 0, hls_url: null });
  else if (kind === "session_closed")
    await set({ is_live: 0, is_recording: 0, is_ended: 1, hls_url: null });
  else if (kind === "recording_ready") {
    await set({ is_recording: 0 });
    if (ev.fileUrl) await copyRecording(w, ev.fileUrl);
  } else if ((kind === "joined" || kind === "left") && participant) {
    await recordVisit(w.event_id, participant, kind);
  }
}

async function recordVisit(
  eventId: number,
  participantId: number,
  kind: "joined" | "left",
) {
  const now = db.ts();
  const row = await db.first<AttendanceRow>("portal_live_attendance", {
    event_id: eventId,
    participant_id: participantId,
  });
  if (kind === "joined") {
    if (!row)
      await db.insert("portal_live_attendance", {
        event_id: eventId,
        participant_id: participantId,
        first_joined: now,
        last_joined: now,
      });
    else
      await db.replace("portal_live_attendance", row.id, {
        ...row,
        last_joined: now,
        last_left: null,
      });
    return;
  }
  if (!row) return;
  // Time is counted per visit, so rejoins add up.
  const spent = row.last_joined
    ? Math.max(0, Math.round((Date.now() - Date.parse(row.last_joined)) / 1000))
    : 0;
  await db.replace("portal_live_attendance", row.id, {
    ...row,
    last_left: now,
    last_joined: null,
    seconds_in: (row.seconds_in ?? 0) + spent,
  });
}

// Recordings are copied into OUR private bucket and served only through the
// ticket-checked replay route, so they survive a provider switch and the
// provider's link is never shown. Held in memory, so a long recording over this
// limit is left for a worker (README).
const MAX_RECORDING_BYTES = 200 * 1024 * 1024;

async function copyRecording(w: WebinarRow, fileUrl: string) {
  const res = await fetch(fileUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Recording download failed (${res.status})`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_RECORDING_BYTES) {
    console.error("[live] recording too large to copy here", w.event_id, len);
    return;
  }
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_RECORDING_BYTES) return;
  const objectName = await uploadRecordingObject(
    w.event_id,
    body,
    res.headers.get("content-type") ?? "video/mp4",
  );
  const fresh = await db.first<WebinarRow>("portal_webinar", {
    event_id: w.event_id,
  });
  if (fresh)
    await db.replace("portal_webinar", w.event_id, {
      ...fresh,
      recording_url: objectName,
      updated_on: db.ts(),
    });
}

/** The stored recording's object name, for the replay route. */
export async function recordingObject(eventId: number) {
  const w = await webinarRow(eventId);
  return w.recording_url;
}
