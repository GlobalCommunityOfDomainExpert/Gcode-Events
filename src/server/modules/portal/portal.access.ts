import "server-only";
import { AppError } from "@/server/http/errors";
import { hashToken } from "./portal.tokens";
import {
  portalRepository as repo,
  type LinkRow,
  type PortalEventRow,
  type TeamRole,
  type TeamRow,
} from "./portal.repository";

// Who may do what for an event. Every portal and live-room service goes
// through here, so the rules live in one place and never in the browser.

/**
 * events.start_date / end_date are stored as UTC wall-clock, whatever the
 * portal view's start_ist / end_ist names say. Reading them as India time put
 * every door window 5.5 hours off.
 */
export const utcMs = (s: string | null | undefined): number | null =>
  s ? Date.parse(`${s}Z`) : null;

export async function getEvent(eventId: number): Promise<PortalEventRow> {
  const ev = await repo.event(eventId);
  if (!ev) throw AppError.notFound("Event");
  return ev;
}

export const isOrganizer = (ev: PortalEventRow, userId: string | null) =>
  !!userId && ev.organizer_id === userId;

/** The organizer, or an ACTIVE co-organizer signed in with their account. */
export async function isManager(
  ev: PortalEventRow,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  if (isOrganizer(ev, userId)) return true;
  return repo.isActiveCoOrganizer(ev.id, userId);
}

export async function requireManager(
  eventId: number,
  userId: string,
): Promise<PortalEventRow> {
  const ev = await getEvent(eventId);
  if (!(await isManager(ev, userId)))
    throw AppError.forbidden(
      "Only the organizer or a co-organizer can do this",
    );
  return ev;
}

/** What a share link or invite token resolves to. No side effects. */
export type Scope =
  | {
      kind: "link";
      eventId: number;
      role: TeamRole;
      viewer: string;
      expired: boolean;
      row: LinkRow;
    }
  | {
      kind: "member";
      eventId: number;
      role: TeamRole;
      viewer: string;
      expired: false;
      row: TeamRow;
    };

/**
 * Revoked links and unknown tokens resolve to null ("not valid"); an expired
 * link resolves with expired = true so the page can say so. Expiry and revoke
 * are checked here on every read.
 */
export async function scopeOf(token: string): Promise<Scope | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = hashToken(token);
  const link = await repo.linkByToken(hash);
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
  const member = await repo.teamByToken(hash);
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
