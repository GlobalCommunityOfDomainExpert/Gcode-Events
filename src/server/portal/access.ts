import * as db from "./ords";
import { forbidden, notFound } from "./http";
import { hashToken } from "./crypto";

// Who may do what for an event. Every route goes through here, so the rules
// live in one place and never in the browser.

export interface EventRow {
  id: number;
  title: string;
  organizer_id: string | null;
  organizer_name: string | null;
  start_ist: string | null;
  end_ist: string | null;
}

export type TeamRole =
  "CO_ORGANIZER" | "VENUE_PARTNER" | "SPONSOR" | "CHECK_IN" | "FINANCE";

export interface TeamRow extends db.Row {
  id: number;
  event_id: number;
  email: string;
  user_id: string | null;
  role: TeamRole;
  status: "INVITED" | "ACTIVE";
  token_hash: string;
  invited_by: string | null;
  invited_on: string;
  activated_on: string | null;
}

export interface LinkRow extends db.Row {
  id: number;
  event_id: number;
  label: string;
  role: Exclude<TeamRole, "CO_ORGANIZER">;
  token_hash: string;
  created_by: string | null;
  created_on: string;
  expires_on: string | null;
  revoked_on: string | null;
  views: number;
}

/**
 * events.start_date / end_date are stored as UTC wall-clock (the API returns
 * them with +00:00), whatever the portal view's start_ist / end_ist names say.
 * Reading them as India time put every door window 5.5 hours off.
 */
export const utcMs = (s: string | null | undefined): number | null =>
  s ? Date.parse(`${s}Z`) : null;

export async function getEvent(eventId: number): Promise<EventRow> {
  const ev = await db.first<EventRow>("portal_v_events", { id: eventId });
  if (!ev) throw notFound("Event not found");
  return ev;
}

export const isOrganizer = (ev: EventRow, userId: string | null) =>
  !!userId && ev.organizer_id === userId;

/** The organizer, or an ACTIVE co-organizer signed in with their account. */
export async function isManager(
  ev: EventRow,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  if (isOrganizer(ev, userId)) return true;
  const rows = await db.list<TeamRow>("portal_team", { event_id: ev.id });
  return rows.some(
    (r) =>
      r.user_id === userId &&
      r.role === "CO_ORGANIZER" &&
      r.status === "ACTIVE",
  );
}

export async function requireManager(
  eventId: number,
  userId: string,
): Promise<EventRow> {
  const ev = await getEvent(eventId);
  if (!(await isManager(ev, userId)))
    throw forbidden("Only the organizer or a co-organizer can do this");
  return ev;
}

/** What a share link or invite token resolves to. No side effects. */
export interface Scope {
  kind: "link" | "member";
  eventId: number;
  role: TeamRole;
  viewer: string;
  expired: boolean;
  row: LinkRow | TeamRow;
}

/**
 * Revoked links and unknown tokens resolve to null ("not valid"); an expired
 * link resolves with expired = true so the page can say so. Expiry and revoke
 * are checked here on every read.
 */
export async function scopeOf(token: string): Promise<Scope | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = hashToken(token);
  const link = await db.first<LinkRow>("portal_share_links", {
    token_hash: hash,
  });
  if (link) {
    if (link.revoked_on) return null;
    return {
      kind: "link",
      eventId: link.event_id,
      role: link.role,
      viewer: link.label,
      expired: !!link.expires_on && Date.parse(link.expires_on) <= Date.now(),
      row: link,
    };
  }
  const member = await db.first<TeamRow>("portal_team", { token_hash: hash });
  if (member)
    return {
      kind: "member",
      eventId: member.event_id,
      role: member.role,
      viewer: member.email,
      expired: false,
      row: member,
    };
  return null;
}

/** What each role may see (mirrors lib/team.ts ROLE_INFO). */
const AREAS: Record<TeamRole, string[]> = {
  CO_ORGANIZER: [
    "overview",
    "schedule",
    "venue",
    "attendees",
    "contacts",
    "checkIn",
    "money",
    "edit",
  ],
  VENUE_PARTNER: ["overview", "schedule", "venue"],
  SPONSOR: ["overview", "schedule"],
  CHECK_IN: ["attendees", "checkIn"],
  FINANCE: ["overview", "money"],
};
export const roleCan = (role: TeamRole, area: string) =>
  AREAS[role].includes(area);
