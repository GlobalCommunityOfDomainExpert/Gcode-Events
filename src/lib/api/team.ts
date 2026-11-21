import { apiRequest } from "./client";
import { ApiListResponse } from "./types";
import { getSession } from "@/lib/auth/session";
import type {
  SharedAccess,
  SharedData,
  ShareLink,
  TeamMember,
  TeamRole,
} from "@/lib/team";

// GCODE_EVENT_TEAM / GCODE_EVENT_SHARE_LINKS (docs/sql/organizer-portal).
// Tokens are 256-bit values the server hashes before storing, so a token is
// returned exactly once, when the invite or link is created. List calls never
// carry one. /shared/:token is the only unauthenticated read.

export interface TeamMemberApi {
  id: number;
  event_id: number;
  email: string;
  role: TeamRole;
  status: "INVITED" | "ACTIVE";
  invited_on: string;
}

export interface ShareLinkApi {
  id: number;
  event_id: number;
  label: string;
  role: TeamRole;
  created_on: string;
  expires_on: string | null;
  views: number;
}

// Same trust level as the other organizer calls (panelists, rounds): the
// backend does not verify bearer tokens, so the handler must treat this id
// as untrusted until ORDS can read the verified JWT.
const actor = () => getSession()?.userId ?? "";

const member = (r: TeamMemberApi): TeamMember => ({
  id: String(r.id),
  eventId: String(r.event_id),
  email: r.email,
  name: null,
  role: r.role,
  status: r.status,
  invitedOn: r.invited_on,
});

const link = (r: ShareLinkApi): ShareLink => ({
  id: String(r.id),
  eventId: String(r.event_id),
  label: r.label,
  role: r.role,
  createdOn: r.created_on,
  expiresOn: r.expires_on,
  views: r.views,
});

// Reads degrade to [] like the other contract-first calls, so the page still
// opens before the endpoints exist.
export async function listTeam(eventId: string): Promise<TeamMember[]> {
  try {
    const { items } = await apiRequest<ApiListResponse<TeamMemberApi>>(
      `/events/${eventId}/team?actor_id=${actor()}`,
    );
    return items.map(member);
  } catch {
    return [];
  }
}

/** Returns the invite token. It is shown once and cannot be fetched again. */
export function inviteTeamMember(
  eventId: string,
  email: string,
  role: TeamRole,
): Promise<{ token: string }> {
  return apiRequest<{ token: string }>(`/events/${eventId}/team`, {
    method: "POST",
    body: { email, role, actor_id: actor() },
  });
}

export function changeTeamRole(id: string, role: TeamRole): Promise<unknown> {
  return apiRequest(`/team/${id}`, {
    method: "PUT",
    body: { role, actor_id: actor() },
  });
}

export function removeTeamMember(id: string): Promise<unknown> {
  return apiRequest(`/team/${id}?actor_id=${actor()}`, { method: "DELETE" });
}

export async function listShareLinks(eventId: string): Promise<ShareLink[]> {
  try {
    const { items } = await apiRequest<ApiListResponse<ShareLinkApi>>(
      `/events/${eventId}/share-links?actor_id=${actor()}`,
    );
    return items.map(link);
  } catch {
    return [];
  }
}

export type LinkExpiry = "7D" | "30D" | "EVENT_END" | "NEVER";

/** Returns the link token. It is shown once and cannot be fetched again. */
export async function createShareLink(
  eventId: string,
  payload: { label: string; role: TeamRole; expiry: LinkExpiry },
): Promise<{ id: string; token: string }> {
  const r = await apiRequest<{ id: number; token: string }>(
    `/events/${eventId}/share-links`,
    {
      method: "POST",
      body: {
        label: payload.label,
        role: payload.role,
        expiry: payload.expiry,
        actor_id: actor(),
      },
    },
  );
  return { id: String(r.id), token: r.token };
}

export function revokeShareLink(id: string): Promise<unknown> {
  return apiRequest(`/share-links/${id}?actor_id=${actor()}`, {
    method: "DELETE",
  });
}

/** Read-only: opening the page must not change anything (see openShared). */
export async function getSharedAccess(token: string): Promise<SharedAccess> {
  const r = await apiRequest<{
    event_id: number;
    role: TeamRole;
    viewer: string;
    kind: "member" | "link";
    expired: boolean;
  }>(`/shared/${token}`);
  return {
    eventId: String(r.event_id),
    role: r.role,
    viewer: r.viewer,
    kind: r.kind,
    expired: r.expired,
  };
}

/**
 * What the role may see, filtered on the server: guests (names only),
 * who has arrived, and money totals for roles that get them.
 */
export async function getSharedData(token: string): Promise<SharedData> {
  const r = await apiRequest<{
    guests?: { id: number; name: string; category: string }[];
    arrived?: number[];
    money?: {
      pending_claims: number;
      pending_amount: number;
      active_coupons: number;
    };
  }>(`/shared/${token}/data`);
  return {
    guests: (r.guests ?? []).map((g) => ({
      id: String(g.id),
      name: g.name,
      category: g.category === "PARTICIPANT" ? "Participant" : "Attendee",
    })),
    arrivedIds: (r.arrived ?? []).map(String),
    money: r.money
      ? {
          pendingClaims: r.money.pending_claims,
          pendingAmount: r.money.pending_amount,
          activeCoupons: r.money.active_coupons,
        }
      : undefined,
  };
}

/** Counts a link view / activates an invite. Deliberately a POST. */
export function openShared(token: string): Promise<unknown> {
  const userId = getSession()?.userId;
  return apiRequest(`/shared/${token}/open`, {
    method: "POST",
    body: userId ? { user_id: userId } : {},
  });
}

/** Door check-in: participant ids marked as arrived. */
export async function listCheckIns(
  eventId: string,
  token?: string,
): Promise<string[]> {
  try {
    const q = token
      ? `token=${encodeURIComponent(token)}`
      : `actor_id=${actor()}`;
    const { items } = await apiRequest<
      ApiListResponse<{ participant_id: number }>
    >(`/events/${eventId}/check-ins?${q}`);
    return items.map((r) => String(r.participant_id));
  } catch {
    return [];
  }
}

export function setCheckIn(
  eventId: string,
  participantId: string,
  arrived: boolean,
  token?: string,
): Promise<unknown> {
  return apiRequest(`/events/${eventId}/check-ins`, {
    method: "POST",
    body: {
      participant_id: Number(participantId),
      arrived,
      ...(token ? { token } : { actor_id: actor() }),
    },
  });
}
