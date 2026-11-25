import { z } from "zod";

// API contract for judging panelists (invite → accept/decline). Shared with
// src/lib/api/panelists.ts.
//
// An accepted panelist can open the event's judge page: score rounds and
// see the decision/score history and the attendee list (without contact
// details).

export type PanelistStatus = "INVITED" | "ACCEPTED" | "DECLINED";
// What the invitee is asked to do. Judges score rounds; speakers present in a
// live webinar; mentors advise. Older rows have no role and are judges.
export type PanelistRole = "JUDGE" | "MENTOR" | "SPEAKER";

// Organizer's list (admin).
export interface Panelist {
  id: number;
  eventId: number;
  userId: string | null;
  invitedEmail: string;
  status: PanelistStatus;
  invitedBy: string | null;
  invitedOn: string;
  respondedOn: string | null;
  role: PanelistRole;
  note: string | null;
}

// The invitee's accept/decline page (only for the invited account).
export interface PanelistInvite {
  id: number;
  eventId: number;
  eventTitle: string;
  invitedEmail: string;
  status: PanelistStatus;
  invitedOn: string;
  role: PanelistRole;
  note: string | null;
}

// GET /api/v1/events/:id/panelists/me — the caller's own standing.
export interface MyPanelistAccess {
  isAcceptedPanelist: boolean;
}

export const panelistIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// POST /api/v1/events/:id/panelists (admin). Emails the invite link.
export const invitePanelistSchema = z.object({
  email: z.email().trim().toLowerCase().max(255),
  // Optional: omitted means a judge invite, as before.
  role: z.enum(["JUDGE", "MENTOR", "SPEAKER"]).optional(),
  note: z.string().trim().max(500).optional(),
});

// POST /api/v1/panelists/:id/response — only from the invited account.
export const respondToInviteSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED"]),
});
