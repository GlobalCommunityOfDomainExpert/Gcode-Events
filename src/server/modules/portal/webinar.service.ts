import "server-only";
import { AppError } from "@/server/http/errors";
import { CLOSES_AFTER_MIN, webinarState } from "@/lib/webinar";
import { uploadRecordingObject } from "@/infrastructure/storage/oci-object-storage";
import { readJoinToken, replayUrl, signJoinToken } from "./portal.tokens";
import { getEvent, isManager, requireManager, utcMs } from "./portal.access";
import {
  portalRepository as repo,
  type PortalEventRow,
  type WebinarPatch,
  type WebinarRow,
} from "./portal.repository";
import * as provider from "./webinar.provider";
import type { NormalizedEvent, OurRole } from "./webinar.provider";
import type {
  HostAction,
  JoinInfoResult,
  LiveAccessResult,
  SaveWebinarBody,
  WebinarSettingsResult,
} from "./portal.schemas";

// The live room's decisions: who may enter and as what, the door state on the
// server clock, host actions run against the provider, attendance and
// recordings from provider events. The database only stores the rows.

/** The provider room is created this long before the start, never earlier. */
export const ROOM_OPENS_BEFORE_MIN = 5;

// Recordings are copied into OUR private bucket and served only through the
// ticket-checked replay route, so they survive a provider switch and the
// provider's link is never shown. Held in memory, so a long recording over this
// limit is left for a worker (docs/sql/organizer-portal/README.md).
const MAX_RECORDING_BYTES = 200 * 1024 * 1024;

async function webinarRow(eventId: number): Promise<WebinarRow> {
  const existing = await repo.webinar(eventId);
  if (existing) return existing;
  await repo.ensureWebinar(eventId);
  const row = await repo.webinar(eventId);
  if (!row) throw new Error("webinar row missing after insert");
  return row;
}

const iso = (ms: number | null) =>
  ms === null ? null : new Date(ms).toISOString();

/**
 * The registration id of a ticket holder, or 0. Either a signed-in account that
 * holds a ticket, or a signed join link (the emailed link a guest uses): the
 * link is checked against the event and must still point at an active
 * registration, so removing someone or cancelling their ticket ends it.
 */
async function registrationOf(
  eventId: number,
  userId: string | null,
  token: string | null,
): Promise<number> {
  const linked = readJoinToken(eventId, token);
  if (!userId && !linked) return 0;
  const parts = await repo.participants(eventId);
  if (linked)
    return (
      parts.find(
        (p) =>
          p.id === linked && p.active === "Y" && p.category !== "PARTICIPANT",
      )?.id ?? 0
    );
  return parts.find((p) => p.user_id === userId && p.active === "Y")?.id ?? 0;
}

async function roleOf(
  ev: PortalEventRow,
  userId: string | null,
): Promise<OurRole> {
  if (!userId) return "attendee";
  if (await isManager(ev, userId)) return "host";
  const ps = await repo.panelists(ev.id);
  return ps.some(
    (p) =>
      p.user_id === userId &&
      p.status === "ACCEPTED" &&
      p.panelist_role === "SPEAKER",
  )
    ? "speaker"
    : "attendee";
}

const stateOf = (ev: PortalEventRow, role: OurRole, now = new Date()) =>
  webinarState(iso(utcMs(ev.start_ist)), iso(utcMs(ev.end_ist)), role, now);

const flag = (b: boolean | undefined) =>
  b === undefined ? undefined : b ? 1 : 0;

/** "" and whitespace become null; undefined means "leave as is". */
const text = (v: string | null | undefined, max: number) =>
  v === undefined ? undefined : (v ?? "").trim().slice(0, max) || null;

/**
 * Saving settings never touches the provider. The room is created on first
 * need, and only once the session is within ROOM_OPENS_BEFORE_MIN of starting
 * (or later), so no room exists for an event that is still days away.
 */
async function ensureRoom(w: WebinarRow, ev: PortalEventRow): Promise<string> {
  if (w.room_ref) return w.room_ref;
  const start = utcMs(ev.start_ist);
  if (start !== null && Date.now() < start - ROOM_OPENS_BEFORE_MIN * 60_000)
    throw AppError.forbidden(
      `The room is set up ${ROOM_OPENS_BEFORE_MIN} minutes before the start. Come back then`,
    );
  const room = await provider.createRoom();
  await repo.updateWebinar(w.event_id, { room_ref: room });
  w.room_ref = room;
  return room;
}

async function requireHost(eventId: number, userId: string) {
  const ev = await getEvent(eventId);
  if ((await roleOf(ev, userId)) !== "host")
    throw AppError.forbidden("Only the host or organizer can do this");
  return ev;
}

async function recordVisit(
  eventId: number,
  participantId: number,
  kind: "joined" | "left",
) {
  if (kind === "joined") {
    await repo.joined(eventId, participantId);
    return;
  }
  const row = await repo.attendance(eventId, participantId);
  if (!row) return;
  // Time is counted per visit, so rejoins add up.
  const spent = row.last_joined
    ? Math.max(0, Math.round((Date.now() - Date.parse(row.last_joined)) / 1000))
    : 0;
  await repo.left(row.id, spent);
}

async function copyRecording(eventId: number, fileUrl: string) {
  const res = await fetch(fileUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Recording download failed (${res.status})`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_RECORDING_BYTES) {
    console.error("[live] recording too large to copy here", eventId, len);
    return;
  }
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_RECORDING_BYTES) return;
  const objectName = await uploadRecordingObject(
    eventId,
    body,
    res.headers.get("content-type") ?? "video/mp4",
  );
  await repo.updateWebinar(eventId, { recording_url: objectName });
}

export const webinarService = {
  // ------------------------------------------------ organizer: settings
  async settings(
    eventId: number,
    userId: string,
  ): Promise<WebinarSettingsResult> {
    const ev = await requireManager(eventId, userId);
    const w = await webinarRow(eventId);
    const ps = await repo.panelists(eventId);
    return {
      audience: w.audience,
      recording: !!w.recording,
      chat: !!w.chat,
      handRaise: !!w.hand_raise,
      captions: !!w.captions,
      notice: w.notice,
      restreamUrl: w.restream_url,
      slidesUrl: w.slides_url,
      replayPublished: !!w.replay_published,
      status: {
        live: !!w.is_live,
        recording: !!w.is_recording,
        ended: !!w.is_ended,
        recordingReady: !!w.recording_url,
      },
      capabilities: provider.capabilities(),
      roomLimit: {
        interactive: Number(process.env.ROOM_LIMIT_INTERACTIVE ?? 50),
        webinarViewers: Number(process.env.ROOM_LIMIT_VIEWERS ?? 100),
      },
      speakers: [
        {
          id: "host",
          name: ev.organizer_name ?? "Host",
          title: "Host",
          role: "HOST",
          inviteStatus: "ACCEPTED",
        },
        ...ps
          .filter(
            (p) =>
              p.panelist_role === "SPEAKER" &&
              (p.status === "INVITED" || p.status === "ACCEPTED"),
          )
          .map((p) => ({
            id: String(p.id),
            name: p.full_name ?? p.invited_email,
            title: "Speaker",
            role: "SPEAKER" as const,
            inviteStatus:
              p.status === "ACCEPTED"
                ? ("ACCEPTED" as const)
                : ("PENDING" as const),
          })),
      ],
    };
  },

  async saveSettings(eventId: number, userId: string, b: SaveWebinarBody) {
    const ev = await requireManager(eventId, userId);
    const w = await webinarRow(eventId);
    const shaping = [b.audience, b.recording, b.chat, b.handRaise].some(
      (v) => v !== undefined,
    );
    // The provider builds the room from these when the session starts.
    if (
      shaping &&
      (w.is_live || w.is_ended || stateOf(ev, "attendee") !== "EARLY")
    )
      throw AppError.badRequest("Room settings are locked once doors are open");
    const slides = text(b.slidesUrl, 500);
    if (slides && !/^https:\/\//i.test(slides))
      throw AppError.badRequest("The slides link must start with https://");
    await repo.updateWebinar(eventId, {
      audience: b.audience,
      recording: flag(b.recording),
      chat: flag(b.chat),
      hand_raise: flag(b.handRaise),
      captions: flag(b.captions),
      replay_published: flag(b.replayPublished),
      notice: text(b.notice, 120),
      restream_url: text(b.restreamUrl, 500),
      slides_url: slides,
    });
  },

  // ----------------------------------------------------------- the door
  /**
   * Works signed out too: the door and the event page still show the
   * countdown and the organizer notice, with registered = false.
   */
  async access(
    eventId: number,
    userId: string | null,
    token: string | null,
  ): Promise<LiveAccessResult> {
    const ev = await getEvent(eventId);
    const w = await webinarRow(eventId);
    const role = await roleOf(ev, userId);
    const reg = await registrationOf(eventId, userId, token);
    // The host pressing End closes the door at once, whatever the clock says.
    const state = w.is_ended ? "ENDED" : stateOf(ev, role);
    const holder = reg > 0 || role !== "attendee";
    // The recording URL is returned only to ticket holders, and only once it
    // is published and stored in our own bucket. A link holder has no
    // account: their registration stands in for the user id.
    const who = userId ?? (reg > 0 ? `p${reg}` : null);
    const replay =
      who &&
      holder &&
      state === "ENDED" &&
      w.replay_published &&
      w.recording_url
        ? { url: replayUrl(eventId, who), slidesUrl: w.slides_url }
        : null;
    return {
      registered: holder,
      role:
        role === "host" ? "HOST" : role === "speaker" ? "SPEAKER" : "ATTENDEE",
      audience: w.audience,
      state,
      live: !!w.is_live,
      notice: w.notice,
      // For ticket holders only: shown while the host is on a break and after.
      slidesUrl: holder ? w.slides_url : null,
      replay,
    };
  },

  /** A join credential for this viewer, or a 403. Tied to their registration. */
  async joinCredential(
    eventId: number,
    userId: string | null,
    token: string | null,
  ): Promise<JoinInfoResult> {
    if (!userId && !token)
      throw AppError.unauthenticated("Sign in again to continue");
    const ev = await getEvent(eventId);
    const role = await roleOf(ev, userId);
    const reg = await registrationOf(eventId, userId, token);
    if (role === "attendee" && reg === 0)
      throw AppError.forbidden("You need a ticket to join this session");
    const w = await webinarRow(eventId);
    const state = stateOf(ev, role);
    if (w.is_ended || state === "EARLY" || state === "ENDED")
      throw AppError.forbidden("The room is not open for you right now");
    if (reg > 0 && (await repo.isBlocked(eventId, reg)))
      throw AppError.forbidden("You were removed from this session");
    // Webinar format: attendees watch, they never publish. Two ways to give
    // them the show:
    //  - Prebuilt viewer (default): they join the room as signalling-only
    //    viewers with a token that carries no moderator right, and see the
    //    stream with chat, polls and raise hand. Their mic and camera buttons
    //    are off in the UI, but VideoSDK does not stop a viewer who calls the
    //    SDK from the console (spike, 2026-11-23): the host can mute and
    //    remove them.
    //  - Stream only (LIVE_ATTENDEE_STREAM_ONLY=1): they get just the stream
    //    address, never a token, so nothing they do can reach the room.
    // Either way nobody is let in before the host is live.
    const webinarViewer = role === "attendee" && w.audience === "livestream";
    if (webinarViewer && process.env.LIVE_ATTENDEE_STREAM_ONLY === "1")
      return { mode: "watch", watchUrl: w.is_live ? w.hls_url : null };
    // Interactive format: attendees may publish (that is the format), but they
    // get no credential until the host has gone live, so nobody sits in or
    // opens an empty room.
    if (role === "attendee" && !w.is_live) return { mode: "wait" };
    const room = await ensureRoom(w, ev);
    const end = (utcMs(ev.end_ist) ?? Date.now()) + CLOSES_AFTER_MIN * 60_000;
    // Short expiry: until the room closes plus 15 minutes, never over 12 hours.
    const ttl = Math.min(
      12 * 3600,
      Math.max(900, Math.round((end - Date.now()) / 1000) + 900),
    );
    const pid = role === "attendee" ? String(reg) : `u${userId}`;
    return {
      mode: "room",
      credential: provider.credentialFor(room, role, pid, ttl),
      viewer: webinarViewer,
    };
  },

  // ------------------------------------------------------- host actions
  /**
   * The host's actions run against the provider FROM THE SERVER, and the
   * matching flag is set only when that call succeeds. Provider webhooks
   * correct the flags afterwards (a failed stream flips them back).
   */
  async hostAction(
    eventId: number,
    userId: string,
    action: HostAction,
    b: { enabled?: boolean; text?: string },
    origin: string,
  ) {
    const ev = await requireHost(eventId, userId);
    const w = await webinarRow(eventId);
    const hook = `${origin}/api/v1/webhooks/live`;
    const save = (patch: WebinarPatch) => repo.updateWebinar(eventId, patch);

    if (action === "notice") {
      await save({ notice: (b.text ?? "").trim().slice(0, 120) || null });
      return;
    }
    if (action === "captions")
      throw AppError.badRequest(
        "Live captions are not available with this room",
      );
    if (w.is_ended) throw AppError.badRequest("This session has ended");

    // Only go-live may create the room. Anything else with no room has nothing
    // to act on, so it must not make one.
    if (action !== "go-live" && !w.room_ref)
      throw AppError.badRequest("The room has not been set up yet");
    const room = await ensureRoom(w, ev);
    if (action === "go-live") {
      if (w.is_live) return;
      let hls: string | null = null;
      if (w.audience === "livestream")
        hls = await provider.startStream(room, hook).catch((e: unknown) => {
          // The provider only streams a session someone is in.
          if (/No active session/i.test(String(e)))
            throw AppError.badRequest("Join the room first, then go live");
          throw e;
        });
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
      const on = b.enabled === true;
      if (on && !w.is_recording) await provider.startRecording(room, hook);
      if (!on && w.is_recording) await provider.stopRecording(room);
      await save({ is_recording: on ? 1 : 0 });
    } else if (action === "end") {
      if (w.is_recording) await provider.stopRecording(room).catch(() => {});
      await provider.endRoom(room);
      await save({ is_live: 0, is_recording: 0, is_ended: 1, hls_url: null });
    }
  },

  async removeFromRoom(
    eventId: number,
    userId: string,
    registrationId: number,
  ) {
    await requireHost(eventId, userId);
    const parts = await repo.participants(eventId);
    if (!parts.some((p) => p.id === registrationId))
      throw AppError.notFound("Participant");
    await repo.block(eventId, registrationId);
    const w = await webinarRow(eventId);
    // Blocking new credentials is what matters; the kick is best effort.
    if (w.room_ref)
      await provider
        .removePerson(w.room_ref, String(registrationId))
        .catch(() => {});
  },

  // ---------------------------------------------------- provider events
  /** Applies one provider event, once. A replayed event hits the unique key. */
  async applyProviderEvent(ev: NormalizedEvent) {
    const w = await repo.webinarByRoom(ev.roomId);
    if (!w) return; // not one of our rooms
    const participant =
      ev.participantId && /^\d+$/.test(ev.participantId)
        ? Number(ev.participantId)
        : null;
    const fresh = await repo.recordProviderEvent({
      eventId: w.event_id,
      providerEventId: ev.providerEventId,
      kind: ev.kind,
      participantId: participant,
    });
    if (!fresh) return; // already applied
    const set = (patch: WebinarPatch) => repo.updateWebinar(w.event_id, patch);
    switch (ev.kind) {
      case "live_started":
        return set({ is_live: 1 });
      case "live_stopped":
        return set({ is_live: 0, hls_url: null });
      case "recording_started":
        return set({ is_recording: 1 });
      case "failed":
      // VideoSDK closes a session whenever the room empties, e.g. the host
      // drops and rejoins. That is not the end of the webinar: only the
      // host's End (hostAction) or the event's own end time ends it.
      case "session_closed":
        return set({ is_live: 0, is_recording: 0, hls_url: null });
      case "recording_ready":
        await set({ is_recording: 0 });
        if (ev.fileUrl) await copyRecording(w.event_id, ev.fileUrl);
        return;
      case "joined":
      case "left":
        if (participant) await recordVisit(w.event_id, participant, ev.kind);
        return;
    }
  },

  /** The stored recording's object name, for the replay route. */
  async recordingObject(eventId: number): Promise<string | null> {
    return (await repo.webinar(eventId))?.recording_url ?? null;
  },

  // -------------------------------------------- join link by email (guests)
  /**
   * Emails a signed join link to the address on one registration. The
   * recipient is read by the database from the registration, never from this
   * request, so a caller can only ever send a link to its rightful owner.
   * Signed-in callers need no id (their own ticket is used). Rate limited in
   * the route.
   */
  async sendJoinLink(
    eventId: number,
    userId: string | null,
    participantId: number,
    origin: string,
  ) {
    const ev = await getEvent(eventId);
    const parts = await repo.participants(eventId);
    const mine = userId
      ? parts.find((p) => p.user_id === userId && p.active === "Y")
      : undefined;
    const pid = mine?.id ?? participantId;
    const row = parts.find((p) => p.id === pid);
    if (!row || row.active !== "Y" || row.category === "PARTICIPANT")
      throw AppError.notFound("Registration");

    // Valid until the room closes plus a day, so a late open still works.
    const end =
      (utcMs(ev.end_ist) ?? Date.now()) + (CLOSES_AFTER_MIN + 24 * 60) * 60_000;
    const url = `${origin.replace(/\/$/, "")}/${eventId}/live?t=${signJoinToken(eventId, pid, end)}`;
    await repo.sendJoinLinkEmail(eventId, pid, url);
  },
};
