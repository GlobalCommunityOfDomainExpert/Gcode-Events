import { portalRequest } from "./portal";
import {
  DEFAULT_WEBINAR,
  type Speaker,
  type WebinarCapabilities,
  type WebinarConfig,
  type WebinarRole,
  type WebinarSettings,
  type WebinarState,
  type WebinarStatus,
} from "@/lib/webinar";

// GCODE_EVENT_WEBINAR et al. (docs/sql/organizer-portal). The caller's
// identity comes from the bearer token the ORDS handler decodes, exactly like
// /participants/me, so none of these calls carry a user id. The provider name
// and room id are never returned.

interface WebinarApi {
  audience: WebinarConfig["audience"];
  recording: boolean;
  chat: boolean;
  hand_raise: boolean;
  captions: boolean;
  notice?: string | null;
  restream_url?: string | null;
  slides_url?: string | null;
  replay_published: boolean;
  status: {
    live: boolean;
    recording: boolean;
    ended: boolean;
    recording_ready: boolean;
  };
  capabilities?: Partial<WebinarCapabilities>;
  room_limit?: { interactive: number; webinar_viewers: number };
  speakers?: {
    id: number | string;
    name: string;
    title?: string | null;
    role: "HOST" | "SPEAKER";
    invite_status: "ACCEPTED" | "PENDING";
  }[];
}

const adapt = (r: WebinarApi): WebinarSettings => ({
  config: {
    audience: r.audience,
    recording: r.recording,
    chat: r.chat,
    handRaise: r.hand_raise,
    captions: r.captions,
    notice: r.notice ?? undefined,
    restreamUrl: r.restream_url ?? undefined,
    slidesUrl: r.slides_url ?? undefined,
    replayPublished: r.replay_published,
  },
  status: {
    live: r.status.live,
    recording: r.status.recording,
    ended: r.status.ended,
    recordingReady: r.status.recording_ready,
  } satisfies WebinarStatus,
  capabilities: { ...DEFAULT_WEBINAR.capabilities, ...r.capabilities },
  roomLimit: r.room_limit
    ? {
        interactive: r.room_limit.interactive,
        webinarViewers: r.room_limit.webinar_viewers,
      }
    : DEFAULT_WEBINAR.roomLimit,
  speakers: (r.speakers ?? []).map((s): Speaker => ({
    id: String(s.id),
    name: s.name,
    title: s.title ?? (s.role === "HOST" ? "Host" : "Speaker"),
    role: s.role === "HOST" ? "host" : "speaker",
    inviteStatus: s.invite_status === "ACCEPTED" ? "accepted" : "pending",
  })),
});

/** Organizer only. A missing config (404) is the same as the defaults. */
export async function getWebinar(
  eventId: string,
): Promise<{ settings: WebinarSettings; configured: boolean }> {
  try {
    const r = await portalRequest<WebinarApi>(`/events/${eventId}/webinar`);
    return { settings: adapt(r), configured: true };
  } catch {
    return { settings: DEFAULT_WEBINAR, configured: false };
  }
}

/** Room-shaping fields are rejected by the server once doors have opened. */
export function saveWebinar(
  eventId: string,
  patch: Partial<WebinarConfig>,
): Promise<unknown> {
  return portalRequest(`/events/${eventId}/webinar`, {
    method: "PUT",
    body: {
      audience: patch.audience,
      recording: patch.recording,
      chat: patch.chat,
      hand_raise: patch.handRaise,
      captions: patch.captions,
      notice: patch.notice,
      restream_url: patch.restreamUrl,
      slides_url: patch.slidesUrl,
      replay_published: patch.replayPublished,
    },
  });
}

export type HostAction =
  "go-live" | "stop" | "record" | "captions" | "notice" | "end";

/** Host or organizer only; the server runs it against the provider. */
export function hostAction(
  eventId: string,
  action: HostAction,
  body: Record<string, unknown> = {},
): Promise<unknown> {
  return portalRequest(`/events/${eventId}/live/${action}`, {
    method: "POST",
    body,
  });
}

export function removeFromRoom(
  eventId: string,
  registrationId: string,
): Promise<unknown> {
  return portalRequest(`/events/${eventId}/live/remove-person`, {
    method: "POST",
    body: { registration_id: Number(registrationId) },
  });
}

/** What the signed-in viewer may see at the door. The only source of role. */
export interface LiveAccess {
  registered: boolean;
  role: WebinarRole;
  state: WebinarState;
  live: boolean;
  notice?: string;
  /** Present only for ticket holders, and only when the replay is published. */
  replay?: { url: string; slidesUrl?: string };
}

export async function getLiveAccess(eventId: string): Promise<LiveAccess> {
  const r = await portalRequest<{
    registered: boolean;
    role: "HOST" | "SPEAKER" | "ATTENDEE";
    state: WebinarState;
    live: boolean;
    notice?: string | null;
    replay?: { url: string; slides_url?: string | null } | null;
  }>(`/events/${eventId}/live-access`);
  return {
    registered: r.registered,
    role:
      r.role === "HOST"
        ? "host"
        : r.role === "SPEAKER"
          ? "speaker"
          : "attendee",
    state: r.state,
    live: r.live,
    notice: r.notice ?? undefined,
    replay: r.replay
      ? { url: r.replay.url, slidesUrl: r.replay.slides_url ?? undefined }
      : undefined,
  };
}

/**
 * A short-lived credential for this viewer's role, tied to their registration.
 * 403 when not registered or outside the window. The string is opaque: the
 * LiveRoom component hands it to the provider.
 */
export async function requestJoinCredential(eventId: string): Promise<string> {
  const r = await portalRequest<{ credential: string }>(
    `/events/${eventId}/live/token`,
    { method: "POST", body: {} },
  );
  return r.credential;
}
