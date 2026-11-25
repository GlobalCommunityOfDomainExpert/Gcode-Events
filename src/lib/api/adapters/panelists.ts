// Panelist invites.

import { EventPanelist } from "@/lib/event";
import type {
  Panelist,
  PanelistInvite as PanelistInviteDto,
} from "@/server/modules/panelists/panelists.schemas";

// Organizer's panelist list item.
export function adaptEventPanelist(row: Panelist): EventPanelist {
  return {
    id: String(row.id),
    eventId: String(row.eventId),
    userId: row.userId ?? undefined,
    invitedEmail: row.invitedEmail,
    status: row.status,
    invitedOn: row.invitedOn,
    respondedOn: row.respondedOn,
  };
}

// Single-invite lookup for the invitee's own accept/decline page.
export interface PanelistInvite {
  id: string;
  eventId: string;
  eventTitle: string;
  invitedEmail: string;
  status: "INVITED" | "ACCEPTED" | "DECLINED";
  invitedOn: string;
  role: "JUDGE" | "MENTOR" | "SPEAKER";
  note?: string;
}

export function adaptPanelistInvite(row: PanelistInviteDto): PanelistInvite {
  return {
    id: String(row.id),
    eventId: String(row.eventId),
    eventTitle: row.eventTitle,
    invitedEmail: row.invitedEmail,
    status: row.status,
    invitedOn: row.invitedOn,
    role: row.role,
    note: row.note ?? undefined,
  };
}
