import { v1Request } from "./client";
import type {
  HostAction,
  JoinInfoResult,
  LiveAccessResult,
  WebinarSettingsResult,
} from "@/server/modules/portal/portal.schemas";
import {
  DEFAULT_WEBINAR,
  type Speaker,
  type WebinarConfig,
  type WebinarRole,
  type WebinarSettings,
  type WebinarState,
  type WebinarStatus,
} from "@/lib/webinar";

// The live room's settings, door and host controls (/api/v1, see
// src/server/modules/portal). The caller is the login cookie, so none of these
// calls carry a user id. The provider name and room id are never returned.

const adapt = (r: WebinarSettingsResult): WebinarSettings => ({
  config: {
    audience: r.audience,
    recording: r.recording,
    chat: r.chat,
    handRaise: r.handRaise,
    captions: r.captions,
    notice: r.notice ?? undefined,
    restreamUrl: r.restreamUrl ?? undefined,
    slidesUrl: r.slidesUrl ?? undefined,
    replayPublished: r.replayPublished,
  },
  status: r.status satisfies WebinarStatus,
  capabilities: { ...DEFAULT_WEBINAR.capabilities, ...r.capabilities },
  roomLimit: r.roomLimit ?? DEFAULT_WEBINAR.roomLimit,
  speakers: r.speakers.map((s): Speaker => ({
    id: s.id,
    name: s.name,
    title: s.title,
    role: s.role === "HOST" ? "host" : "speaker",
    inviteStatus: s.inviteStatus === "ACCEPTED" ? "accepted" : "pending",
  })),
});

/** Organizer only. A missing config (404) is the same as the defaults. */
export async function getWebinar(
  eventId: string,
): Promise<{ settings: WebinarSettings; configured: boolean }> {
  try {
    const r = await v1Request<WebinarSettingsResult>(
      `/events/${eventId}/webinar`,
    );
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
  return v1Request(`/events/${eventId}/webinar`, {
    method: "PUT",
    body: {
      audience: patch.audience,
      recording: patch.recording,
      chat: patch.chat,
      handRaise: patch.handRaise,
      captions: patch.captions,
      notice: patch.notice,
      restreamUrl: patch.restreamUrl,
      slidesUrl: patch.slidesUrl,
      replayPublished: patch.replayPublished,
    },
  });
}

export type { HostAction };

/** Host or organizer only; the server runs it against the provider. */
export function hostAction(
  eventId: string,
  action: HostAction,
  body: Record<string, unknown> = {},
): Promise<unknown> {
  return v1Request(`/events/${eventId}/live/${action}`, {
    method: "POST",
    body,
  });
}

export function removeFromRoom(
  eventId: string,
  registrationId: string,
): Promise<unknown> {
  return v1Request(`/events/${eventId}/live/remove-person`, {
    method: "POST",
    body: { registrationId: Number(registrationId) },
  });
}

/** What the signed-in viewer may see at the door. The only source of role. */
export interface LiveAccess {
  registered: boolean;
  role: WebinarRole;
  state: WebinarState;
  /** Interactive: everyone may publish. Livestream: attendees only watch. */
  audience: "interactive" | "livestream";
  live: boolean;
  notice?: string;
  /** Present only for ticket holders, whenever the organizer has set it. */
  slidesUrl?: string;
  /** Present only for ticket holders, and only when the replay is published. */
  replay?: { url: string; slidesUrl?: string };
}

/**
 * `token` is the signed join link from the registration email (the `t` in
 * /events/<id>/live?t=...). It lets a guest with no account prove their
 * ticket; a signed-in account needs none.
 */
export async function getLiveAccess(
  eventId: string,
  token?: string | null,
): Promise<LiveAccess> {
  const r = await v1Request<LiveAccessResult>(
    `/events/${eventId}/live-access`,
    { query: { t: token ?? undefined } },
  );
  return {
    registered: r.registered,
    role:
      r.role === "HOST"
        ? "host"
        : r.role === "SPEAKER"
          ? "speaker"
          : "attendee",
    audience: r.audience,
    state: r.state,
    live: r.live,
    notice: r.notice ?? undefined,
    slidesUrl: r.slidesUrl ?? undefined,
    replay: r.replay
      ? { url: r.replay.url, slidesUrl: r.replay.slidesUrl ?? undefined }
      : undefined,
  };
}

/**
 * What the server lets this viewer do: a short-lived meeting credential (host
 * and speakers) or, for a Webinar attendee, the stream address. 403 when not
 * registered or outside the window.
 */
export type JoinInfo = JoinInfoResult;

export function requestJoinCredential(
  eventId: string,
  token?: string | null,
): Promise<JoinInfo> {
  return v1Request<JoinInfo>(`/events/${eventId}/live/token`, {
    method: "POST",
    body: token ? { t: token } : {},
  });
}

/**
 * Email the join link to the address on a registration. Needs no account: the
 * server sends it only to the registrant's own address, at most once a minute.
 */
export function emailJoinLink(
  eventId: string,
  participantId: string | number,
): Promise<unknown> {
  return v1Request(`/events/${eventId}/join-link`, {
    method: "POST",
    body: { participantId: Number(participantId) },
  });
}
