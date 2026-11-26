import { v1Request } from "./client";
import type {
  SharedAccessResult,
  SharedDataResult,
  ShareLinkItem,
  TeamMemberItem,
} from "@/server/modules/portal/portal.schemas";
import type {
  SharedAccess,
  SharedData,
  ShareLink,
  TeamMember,
  TeamRole,
} from "@/lib/team";

// GCODE_EVENT_TEAM / GCODE_EVENT_SHARE_LINKS through /api/v1 (see
// src/server/modules/portal). Tokens are 256-bit values the server hashes
// before storing, so a token is returned exactly once, when the invite or link
// is created. List calls never carry one. /shared/:token is the only
// unauthenticated read. The acting user is the login cookie, never a body
// field.

const member = (r: TeamMemberItem): TeamMember => ({
  id: String(r.id),
  eventId: String(r.eventId),
  email: r.email,
  name: null,
  role: r.role,
  status: r.status,
  invitedOn: r.invitedOn,
});

const link = (r: ShareLinkItem): ShareLink => ({
  id: String(r.id),
  eventId: String(r.eventId),
  label: r.label,
  role: r.role,
  createdOn: r.createdOn,
  expiresOn: r.expiresOn,
  views: r.views,
});

// Reads degrade to [] like the other contract-first calls, so the page still
// opens before the endpoints exist.
export async function listTeam(eventId: string): Promise<TeamMember[]> {
  try {
    const items = await v1Request<TeamMemberItem[]>(`/events/${eventId}/team`);
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
  return v1Request<{ token: string }>(`/events/${eventId}/team`, {
    method: "POST",
    body: { email, role },
  });
}

export function changeTeamRole(id: string, role: TeamRole): Promise<unknown> {
  return v1Request(`/team/${id}`, {
    method: "PUT",
    body: { role },
  });
}

export function removeTeamMember(id: string): Promise<unknown> {
  return v1Request(`/team/${id}`, { method: "DELETE" });
}

export async function listShareLinks(eventId: string): Promise<ShareLink[]> {
  try {
    const items = await v1Request<ShareLinkItem[]>(
      `/events/${eventId}/share-links`,
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
  const r = await v1Request<{ id: number; token: string }>(
    `/events/${eventId}/share-links`,
    {
      method: "POST",
      body: {
        label: payload.label,
        role: payload.role,
        expiry: payload.expiry,
      },
    },
  );
  return { id: String(r.id), token: r.token };
}

export function revokeShareLink(id: string): Promise<unknown> {
  return v1Request(`/share-links/${id}`, {
    method: "DELETE",
  });
}

/** Read-only: opening the page must not change anything (see openShared). */
export async function getSharedAccess(token: string): Promise<SharedAccess> {
  const r = await v1Request<SharedAccessResult>(`/shared/${token}`);
  return {
    eventId: String(r.eventId),
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
  const r = await v1Request<SharedDataResult>(`/shared/${token}/data`);
  return {
    guests: (r.guests ?? []).map((g) => ({
      id: String(g.id),
      name: g.name,
      category: g.category === "PARTICIPANT" ? "Participant" : "Attendee",
    })),
    arrivedIds: (r.arrived ?? []).map(String),
    money: r.money ?? undefined,
  };
}

/** Counts a link view / activates an invite. Deliberately a POST. */
export function openShared(token: string): Promise<unknown> {
  // A signed-in caller is identified by the login cookie, which a
  // co-organizer invite needs; view-only roles open it anonymously.
  return v1Request(`/shared/${token}/open`, { method: "POST" });
}

/** Door check-in: participant ids marked as arrived. */
export async function listCheckIns(
  eventId: string,
  token?: string,
): Promise<string[]> {
  try {
    const ids = await v1Request<number[]>(`/events/${eventId}/check-ins`, {
      query: { token },
    });
    return ids.map(String);
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
  return v1Request(`/events/${eventId}/check-ins`, {
    method: "POST",
    body: {
      participantId: Number(participantId),
      arrived,
      token,
    },
  });
}
