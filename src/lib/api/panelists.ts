import { v1Request } from "./client";
import type {
  MyPanelistAccess,
  Panelist,
  PanelistInvite,
} from "@/server/modules/panelists/panelists.schemas";

export type { MyPanelistAccess, Panelist, PanelistInvite };

// /api/v1 judging panelists. Browser-only.

// Organizer list (admin).
export function listEventPanelists(
  eventId: number | string,
): Promise<Panelist[]> {
  return v1Request(`/events/${eventId}/panelists`);
}

// Whether the signed-in user is an accepted panelist for this event.
export function getMyPanelistAccess(
  eventId: number | string,
): Promise<MyPanelistAccess> {
  return v1Request(`/events/${eventId}/panelists/me`);
}

// Organizer (admin): emails the invite link.
export function invitePanelist(
  eventId: number | string,
  email: string,
): Promise<{ id: number }> {
  return v1Request(`/events/${eventId}/panelists`, {
    method: "POST",
    body: { email },
  });
}

// The invitee's accept/decline page. Only the invited account (or an admin)
// can read it; anyone else gets a 403 explaining which account to use.
export function getPanelistInvite(
  panelistId: number | string,
): Promise<PanelistInvite> {
  return v1Request(`/panelists/${panelistId}`);
}

// Only from the invited account.
export function respondToPanelistInvite(
  panelistId: number | string,
  status: "ACCEPTED" | "DECLINED",
): Promise<void> {
  return v1Request(`/panelists/${panelistId}/response`, {
    method: "POST",
    body: { status },
  });
}

// Organizer (admin): revokes an invite.
export function removePanelist(panelistId: number | string): Promise<void> {
  return v1Request(`/panelists/${panelistId}`, { method: "DELETE" });
}
