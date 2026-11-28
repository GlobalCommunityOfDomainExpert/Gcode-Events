import { z } from "zod";

// API contract for the organizer portal (team, share links, shared views,
// check-in) and the live room. Shared with src/lib/api/team.ts and
// src/lib/api/webinar.ts.
//
// Tokens are 256-bit values the server hashes before storing, so a token is
// returned exactly once, when the invite or link is created. The provider's
// name, room id, stream address (except to a live viewer) and recording file
// are never returned.

export const TEAM_ROLES = [
  "CO_ORGANIZER",
  "VENUE_PARTNER",
  "SPONSOR",
  "CHECK_IN",
  "FINANCE",
] as const;
export type TeamRoleCode = (typeof TEAM_ROLES)[number];

// ------------------------------------------------------------------ params
export const portalEventParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export const portalIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export const sharedTokenParamsSchema = z.object({
  token: z.string().max(128),
});

// ------------------------------------------------------------- team & links
export const inviteMemberBodySchema = z.object({
  email: z.string().trim().max(255),
  role: z.enum(TEAM_ROLES),
});

export const teamRoleBodySchema = z.object({
  role: z.enum(TEAM_ROLES),
});

export const LINK_EXPIRIES = ["7D", "30D", "EVENT_END", "NEVER"] as const;
export const createLinkBodySchema = z.object({
  label: z.string().trim().max(120),
  role: z.enum(TEAM_ROLES),
  expiry: z.enum(LINK_EXPIRIES),
});

export interface TeamMemberItem {
  id: number;
  eventId: number;
  email: string;
  role: TeamRoleCode;
  status: "INVITED" | "ACTIVE";
  invitedOn: string;
}

export interface ShareLinkItem {
  id: number;
  eventId: number;
  label: string;
  role: TeamRoleCode;
  createdOn: string;
  expiresOn: string | null;
  views: number;
}

export interface SharedAccessResult {
  eventId: number;
  role: TeamRoleCode;
  kind: "link" | "member";
  viewer: string;
  expired: boolean;
}

/** What the role may see, filtered on the server. Never contacts. */
export interface SharedDataResult {
  guests: { id: number; name: string; category: string }[] | null;
  arrived: number[] | null;
  money: {
    pendingClaims: number;
    pendingAmount: number;
    activeCoupons: number;
  } | null;
}

// ---------------------------------------------------------------- check-in
// A manager signs in; door staff can instead pass a CHECK_IN link or invite
// token.
export const checkInsQuerySchema = z.object({
  token: z.string().max(128).optional(),
});
export const checkInBodySchema = z.object({
  participantId: z.coerce.number().int().positive(),
  arrived: z.boolean(),
  token: z.string().max(128).optional(),
});

// ----------------------------------------------------------------- webinar
const optionalText = (max: number) => z.string().max(max).nullable().optional();

export const saveWebinarBodySchema = z.object({
  audience: z.enum(["interactive", "livestream"]).optional(),
  recording: z.boolean().optional(),
  chat: z.boolean().optional(),
  handRaise: z.boolean().optional(),
  captions: z.boolean().optional(),
  notice: optionalText(500),
  restreamUrl: optionalText(500),
  slidesUrl: optionalText(500),
  replayPublished: z.boolean().optional(),
});
export type SaveWebinarBody = z.infer<typeof saveWebinarBodySchema>;

export interface WebinarSettingsResult {
  audience: "interactive" | "livestream";
  recording: boolean;
  chat: boolean;
  handRaise: boolean;
  captions: boolean;
  notice: string | null;
  restreamUrl: string | null;
  slidesUrl: string | null;
  replayPublished: boolean;
  status: {
    live: boolean;
    recording: boolean;
    ended: boolean;
    recordingReady: boolean;
  };
  capabilities: {
    pause: boolean;
    notice: boolean;
    captions: boolean;
    restream: boolean;
  };
  roomLimit: { interactive: number; webinarViewers: number };
  speakers: {
    id: string;
    name: string;
    title: string;
    role: "HOST" | "SPEAKER";
    inviteStatus: "ACCEPTED" | "PENDING";
  }[];
}

export const HOST_ACTIONS = [
  "go-live",
  "stop",
  "record",
  "captions",
  "notice",
  "end",
] as const;
export type HostAction = (typeof HOST_ACTIONS)[number];

export const hostActionParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  action: z.enum(HOST_ACTIONS),
});
export const hostActionBodySchema = z.object({
  enabled: z.boolean().optional(), // record
  text: z.string().max(500).optional(), // notice
});

export const removePersonBodySchema = z.object({
  registrationId: z.coerce.number().int().positive(),
});

// `t` is the signed join link from the registration email (the `t` in
// /<id>/live?t=...). It lets a guest with no account prove their
// ticket; a signed-in account needs none.
export const liveAccessQuerySchema = z.object({
  t: z.string().max(200).optional(),
});
export const joinTokenBodySchema = z.object({
  t: z.string().max(200).optional(),
});

export interface LiveAccessResult {
  registered: boolean;
  role: "HOST" | "SPEAKER" | "ATTENDEE";
  audience: "interactive" | "livestream";
  state: "EARLY" | "BACKSTAGE" | "OPEN" | "ENDED";
  live: boolean;
  notice: string | null;
  slidesUrl: string | null;
  replay: { url: string; slidesUrl: string | null } | null;
}

export type JoinInfoResult =
  | { mode: "room"; credential: string; viewer: boolean }
  | { mode: "watch"; watchUrl: string | null }
  | { mode: "wait" };

export const joinLinkBodySchema = z.object({
  participantId: z.coerce.number().int().nonnegative().optional(),
});

export const replayQuerySchema = z.object({
  u: z.string().max(60),
  e: z.coerce.number().int(),
  s: z.string().max(128),
});
