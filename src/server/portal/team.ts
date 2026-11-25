import * as db from "./ords";
import { badRequest, forbidden, notFound } from "./http";
import { hashToken, newToken } from "./crypto";
import {
  getEvent,
  isManager,
  isOrganizer,
  utcMs,
  requireManager,
  roleCan,
  scopeOf,
  type LinkRow,
  type Scope,
  type TeamRole,
  type TeamRow,
} from "./access";

const ROLES: TeamRole[] = [
  "CO_ORGANIZER",
  "VENUE_PARTNER",
  "SPONSOR",
  "CHECK_IN",
  "FINANCE",
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ------------------------------------------------------------------ team
export async function listTeam(eventId: number, userId: string) {
  await requireManager(eventId, userId);
  const rows = await db.list<TeamRow>("portal_team", { event_id: eventId });
  // token_hash is never returned.
  return rows.map((r) => ({
    id: r.id,
    event_id: r.event_id,
    email: r.email,
    role: r.role,
    status: r.status,
    invited_on: r.invited_on,
  }));
}

export async function inviteMember(
  eventId: number,
  userId: string,
  emailRaw: string,
  role: string,
): Promise<{ token: string }> {
  const ev = await requireManager(eventId, userId);
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL.test(email)) throw badRequest("Enter a valid email");
  if (!ROLES.includes(role as TeamRole)) throw badRequest("Unknown role");
  // Full edit and email powers stay with the organizer.
  if (role === "CO_ORGANIZER" && !isOrganizer(ev, userId))
    throw forbidden("Only the organizer can add a co-organizer");
  const token = newToken();
  try {
    await db.insert("portal_team", {
      event_id: eventId,
      email,
      role,
      token_hash: hashToken(token),
      invited_by: userId,
    });
  } catch (e) {
    if (e instanceof Error && /already exists/.test(e.message))
      throw badRequest("That email is already on the team");
    throw e;
  }
  return { token };
}

async function memberById(id: number): Promise<TeamRow> {
  const row = await db.first<TeamRow>("portal_team", { id });
  if (!row) throw notFound("Team member not found");
  return row;
}

export async function setMemberRole(id: number, userId: string, role: string) {
  const row = await memberById(id);
  const ev = await requireManager(row.event_id, userId);
  if (!ROLES.includes(role as TeamRole)) throw badRequest("Unknown role");
  if (
    (role === "CO_ORGANIZER" || row.role === "CO_ORGANIZER") &&
    !isOrganizer(ev, userId)
  )
    throw forbidden("Only the organizer can change a co-organizer");
  await db.replace("portal_team", id, { ...row, role });
}

export async function removeMember(id: number, userId: string) {
  const row = await memberById(id);
  const ev = await requireManager(row.event_id, userId);
  if (row.role === "CO_ORGANIZER" && !isOrganizer(ev, userId))
    throw forbidden("Only the organizer can remove a co-organizer");
  await db.remove("portal_team", id);
}

// ----------------------------------------------------------- share links
export async function listLinks(eventId: number, userId: string) {
  await requireManager(eventId, userId);
  const rows = await db.list<LinkRow>("portal_share_links", {
    event_id: eventId,
  });
  return rows
    .filter((r) => !r.revoked_on)
    .sort((a, b) => b.created_on.localeCompare(a.created_on))
    .map((r) => ({
      id: r.id,
      event_id: r.event_id,
      label: r.label,
      role: r.role,
      created_on: r.created_on,
      expires_on: r.expires_on,
      views: r.views,
    }));
}

export async function createLink(
  eventId: number,
  userId: string,
  label: string,
  role: string,
  expiry: string,
): Promise<{ id: number; token: string }> {
  const ev = await requireManager(eventId, userId);
  if (!label) throw badRequest("Give the link a label");
  if (!["VENUE_PARTNER", "SPONSOR", "CHECK_IN", "FINANCE"].includes(role))
    throw badRequest("Links cannot grant that role. Invite by email instead");
  let expires: string | null;
  const day = 86_400_000;
  if (expiry === "7D") expires = db.ts(new Date(Date.now() + 7 * day));
  else if (expiry === "30D") expires = db.ts(new Date(Date.now() + 30 * day));
  else if (expiry === "NEVER") expires = null;
  else if (expiry === "EVENT_END") {
    // a day of slack after the end, so the link works through the wrap-up
    const end = utcMs(ev.end_ist) ?? utcMs(ev.start_ist) ?? Date.now();
    expires = db.ts(new Date(end + day));
  } else throw badRequest("Unknown expiry");
  const token = newToken();
  const row = await db.insert<LinkRow>("portal_share_links", {
    event_id: eventId,
    label,
    role,
    token_hash: hashToken(token),
    created_by: userId,
    expires_on: expires,
  });
  const id =
    row.id ??
    (
      await db.first<LinkRow>("portal_share_links", {
        token_hash: hashToken(token),
      })
    )?.id;
  if (!id) throw new Error("share link was created but its id is unknown");
  return { id, token };
}

export async function revokeLink(id: number, userId: string) {
  const row = await db.first<LinkRow>("portal_share_links", { id });
  if (!row) throw notFound("Link not found");
  await requireManager(row.event_id, userId);
  if (!row.revoked_on)
    await db.replace("portal_share_links", id, { ...row, revoked_on: db.ts() });
}

// ----------------------------------------------------------- shared view
/** GET /shared/:token. Reads only. */
export async function sharedAccess(token: string) {
  const s = await scopeOf(token);
  if (!s) throw notFound("This link is not valid");
  return {
    event_id: s.eventId,
    role: s.role,
    kind: s.kind,
    viewer: s.viewer,
    expired: s.expired,
  };
}

/**
 * POST /shared/:token/open. Counts a link view, or activates an invite.
 * Idempotent: opening an invite twice never makes two members.
 */
export async function openShared(token: string, userId: string | null) {
  const s = await scopeOf(token);
  if (!s) throw notFound("This link is not valid");
  if (s.expired) return;
  if (s.kind === "link") {
    const row = s.row as LinkRow;
    await db.replace("portal_share_links", row.id, {
      ...row,
      views: (row.views ?? 0) + 1,
    });
    return;
  }
  const m = s.row as TeamRow;
  if (m.role === "CO_ORGANIZER" && !userId)
    throw forbidden("Sign in to accept a co-organizer invite");
  if (m.status === "ACTIVE" && (m.user_id || !userId)) return;
  await db.replace("portal_team", m.id, {
    ...m,
    status: "ACTIVE",
    user_id: m.user_id ?? userId,
    activated_on: m.activated_on ?? db.ts(),
  });
}

interface PartRow extends db.Row {
  id: number;
  event_id: number;
  user_id: string | null;
  category: string;
  active: string;
  full_name: string | null;
  email: string | null;
}

/** Everything a shared view shows, cut down to the role. Never contacts. */
export async function sharedData(token: string) {
  const s = await scopeOf(token);
  if (!s || s.expired) throw notFound("This link is not valid");
  const out: {
    guests?: { id: number; name: string; category: string }[];
    arrived?: number[];
    money?: {
      pending_claims: number;
      pending_amount: number;
      active_coupons: number;
    };
  } = {};
  if (roleCan(s.role, "attendees")) {
    const parts = await db.list<PartRow>("portal_v_participants", {
      event_id: s.eventId,
    });
    out.guests = parts
      .filter((p) => p.active === "Y")
      .map((p) => ({
        id: p.id,
        name: p.full_name ?? "Guest",
        category: p.category,
      }));
  }
  if (roleCan(s.role, "checkIn") || roleCan(s.role, "overview")) {
    const rows = await db.list<db.Row & { participant_id: number }>(
      "portal_checkins",
      { event_id: s.eventId },
    );
    out.arrived = rows.map((r) => r.participant_id);
  }
  if (roleCan(s.role, "money")) {
    const m = await db.first<
      db.Row & {
        pending_claims: number;
        pending_amount: number;
        active_coupons: number;
      }
    >("portal_v_money", { event_id: s.eventId });
    out.money = {
      pending_claims: m?.pending_claims ?? 0,
      pending_amount: m?.pending_amount ?? 0,
      active_coupons: m?.active_coupons ?? 0,
    };
  }
  return out;
}

// -------------------------------------------------------------- check-in
/** Who is checking people in: a manager, or a CHECK_IN link / invite. */
async function checkInActor(
  eventId: number,
  userId: string | null,
  token: string | null,
): Promise<string> {
  const ev = await getEvent(eventId);
  if (await isManager(ev, userId)) return userId as string;
  if (token) {
    const s: Scope | null = await scopeOf(token);
    if (s && !s.expired && s.eventId === eventId && s.role === "CHECK_IN")
      return s.kind === "link" ? `link:${s.viewer}` : `invite:${s.viewer}`;
  }
  throw forbidden("You cannot check people in for this event");
}

export async function listCheckIns(
  eventId: number,
  userId: string | null,
  token: string | null,
) {
  await checkInActor(eventId, userId, token);
  const rows = await db.list<db.Row & { participant_id: number }>(
    "portal_checkins",
    { event_id: eventId },
  );
  return rows.map((r) => ({ participant_id: r.participant_id }));
}

export async function setCheckIn(
  eventId: number,
  userId: string | null,
  token: string | null,
  participantId: number,
  arrived: boolean,
) {
  const by = await checkInActor(eventId, userId, token);
  const parts = await db.list<PartRow>("portal_v_participants", {
    event_id: eventId,
  });
  if (!parts.some((p) => p.id === participantId))
    throw notFound("Participant not found");
  const existing = await db.first<db.Row & { id: number }>("portal_checkins", {
    event_id: eventId,
    participant_id: participantId,
  });
  if (arrived && !existing)
    await db.insert("portal_checkins", {
      event_id: eventId,
      participant_id: participantId,
      checked_in_by: by,
    });
  else if (!arrived && existing)
    await db.remove("portal_checkins", existing.id);
}
