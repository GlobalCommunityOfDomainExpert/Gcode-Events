import { apiRequest } from "./client";
import { ApiListResponse, EventPanelistApi, PanelistInviteApi } from "./types";
import { getSession } from "@/lib/auth/session";

// Contract-only — GCODE_EVENT_PANELISTS doesn't exist on the live backend
// yet, so this degrades to [] instead of throwing into whatever Promise.all
// it's called from (see project memory "contract-first-ords-endpoints").
export async function listEventPanelists(
  eventId: number | string,
): Promise<EventPanelistApi[]> {
  try {
    const { items } = await apiRequest<ApiListResponse<EventPanelistApi>>(
      `/events/${eventId}/panelists`,
    );
    return items;
  } catch {
    return [];
  }
}

// Organizer-only — invites an email as a judging panelist for this event.
// Not degrade-safe: the organizer needs to see a real error if this fails,
// same as decideRoundStatus/submitRoundScore.
export function invitePanelist(
  eventId: number | string,
  email: string,
  // Optional: a backend that has not added the columns ignores both fields
  // and behaves exactly as before (docs/sql/organizer-portal).
  extra?: { role?: "JUDGE" | "MENTOR" | "SPEAKER"; note?: string },
): Promise<EventPanelistApi> {
  const invitedBy = getSession()?.userId ?? "";
  return apiRequest(`/events/${eventId}/panelists`, {
    method: "POST",
    body: {
      email,
      invited_by: invitedBy,
      ...(extra?.role ? { panelist_role: extra.role } : {}),
      ...(extra?.note ? { invite_note: extra.note } : {}),
    },
  });
}

// Public-ish (any signed-in user) — single invite lookup for the invitee's
// own accept/decline page, which only has the panelist id from the link.
// GET /panelists/:id wraps the row in { items: [...] } (ORDS refcursor
// output), same convention as getEvent in events.ts.
export async function getPanelistInvite(
  panelistId: number | string,
): Promise<PanelistInviteApi> {
  const { items } = await apiRequest<{ items: PanelistInviteApi[] }>(
    `/panelists/${panelistId}`,
  );
  return items[0];
}

// The invitee accepting/declining their own invite — p_user_id comes from
// the caller's own session, same trust level as decideRoundStatus's
// decided_by (this backend doesn't verify bearer tokens server-side).
export function respondToPanelistInvite(
  panelistId: number | string,
  status: "ACCEPTED" | "DECLINED",
): Promise<unknown> {
  const userId = getSession()?.userId ?? "";
  return apiRequest(`/panelists/${panelistId}/respond`, {
    method: "PUT",
    body: { status, user_id: userId },
  });
}

// Organizer-only — revokes/removes an invite.
export function removePanelist(panelistId: number | string): Promise<unknown> {
  return apiRequest(`/panelists/${panelistId}`, { method: "DELETE" });
}
