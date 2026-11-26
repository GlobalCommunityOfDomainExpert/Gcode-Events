import "server-only";
import { AppError } from "@/server/http/errors";
import { hashToken, newToken } from "./portal.tokens";
import {
  getEvent,
  isManager,
  isOrganizer,
  requireManager,
  roleCan,
  scopeOf,
  utcMs,
} from "./portal.access";
import { portalRepository as repo, type LinkRole } from "./portal.repository";
import type {
  ShareLinkItem,
  SharedAccessResult,
  SharedDataResult,
  TeamMemberItem,
  TeamRoleCode,
} from "./portal.schemas";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK_ROLES: LinkRole[] = [
  "VENUE_PARTNER",
  "SPONSOR",
  "CHECK_IN",
  "FINANCE",
];
const DAY = 86_400_000;

const notValid = () => new AppError("NOT_FOUND", "This link is not valid");

async function memberById(id: number) {
  const row = await repo.teamMember(id);
  if (!row) throw AppError.notFound("Team member");
  return row;
}

/** Who is checking people in: a manager, or a CHECK_IN link / invite. */
async function checkInActor(
  eventId: number,
  userId: string | null,
  token: string | null,
): Promise<string> {
  const ev = await getEvent(eventId);
  if (userId && (await isManager(ev, userId))) return userId;
  if (token) {
    const s = await scopeOf(token);
    if (s && !s.expired && s.eventId === eventId && s.role === "CHECK_IN")
      return s.kind === "link" ? `link:${s.viewer}` : `invite:${s.viewer}`;
  }
  throw AppError.forbidden("You cannot check people in for this event");
}

export const teamService = {
  // ---------------------------------------------------------------- team
  async list(eventId: number, userId: string): Promise<TeamMemberItem[]> {
    await requireManager(eventId, userId);
    // token_hash is never returned.
    return (await repo.teamByEvent(eventId)).map((r) => ({
      id: r.id,
      eventId: r.event_id,
      email: r.email,
      role: r.role,
      status: r.status,
      invitedOn: r.invited_on,
    }));
  },

  /** Returns the invite token once. Only its hash is stored. */
  async invite(
    eventId: number,
    userId: string,
    emailRaw: string,
    role: TeamRoleCode,
  ): Promise<{ token: string }> {
    const ev = await requireManager(eventId, userId);
    const email = emailRaw.trim().toLowerCase();
    if (!EMAIL.test(email)) throw AppError.badRequest("Enter a valid email");
    // Full edit and email powers stay with the organizer.
    if (role === "CO_ORGANIZER" && !isOrganizer(ev, userId))
      throw AppError.forbidden("Only the organizer can add a co-organizer");
    const token = newToken();
    const added = await repo.addTeamMember({
      eventId,
      email,
      role,
      tokenHash: hashToken(token),
      invitedBy: userId,
    });
    if (!added)
      throw new AppError("CONFLICT", "That email is already on the team");
    return { token };
  },

  async setRole(id: number, userId: string, role: TeamRoleCode) {
    const row = await memberById(id);
    const ev = await requireManager(row.event_id, userId);
    if (
      (role === "CO_ORGANIZER" || row.role === "CO_ORGANIZER") &&
      !isOrganizer(ev, userId)
    )
      throw AppError.forbidden("Only the organizer can change a co-organizer");
    await repo.setTeamRole(id, role);
  },

  async remove(id: number, userId: string) {
    const row = await memberById(id);
    const ev = await requireManager(row.event_id, userId);
    if (row.role === "CO_ORGANIZER" && !isOrganizer(ev, userId))
      throw AppError.forbidden("Only the organizer can remove a co-organizer");
    await repo.removeTeamMember(id);
  },

  // --------------------------------------------------------- share links
  async listLinks(eventId: number, userId: string): Promise<ShareLinkItem[]> {
    await requireManager(eventId, userId);
    return (await repo.linksByEvent(eventId)).map((r) => ({
      id: r.id,
      eventId: r.event_id,
      label: r.label,
      role: r.role,
      createdOn: r.created_on,
      expiresOn: r.expires_on,
      views: r.views,
    }));
  },

  /** Returns the link token once. Only its hash is stored. */
  async createLink(
    eventId: number,
    userId: string,
    label: string,
    role: TeamRoleCode,
    expiry: "7D" | "30D" | "EVENT_END" | "NEVER",
  ): Promise<{ id: number; token: string }> {
    const ev = await requireManager(eventId, userId);
    if (!label) throw AppError.badRequest("Give the link a label");
    // No co-organizer links: that role edits the event, so it needs an account.
    if (!LINK_ROLES.includes(role as LinkRole))
      throw AppError.badRequest(
        "Links cannot grant that role. Invite by email instead",
      );
    const expiresOn =
      expiry === "7D"
        ? new Date(Date.now() + 7 * DAY)
        : expiry === "30D"
          ? new Date(Date.now() + 30 * DAY)
          : expiry === "EVENT_END"
            ? // a day of slack after the end, so the link works through the wrap-up
              new Date(
                (utcMs(ev.end_ist) ?? utcMs(ev.start_ist) ?? Date.now()) + DAY,
              )
            : null;
    const token = newToken();
    const id = await repo.addLink({
      eventId,
      label,
      role: role as LinkRole,
      tokenHash: hashToken(token),
      createdBy: userId,
      expiresOn,
    });
    return { id, token };
  },

  async revokeLink(id: number, userId: string) {
    const row = await repo.link(id);
    if (!row) throw AppError.notFound("Link");
    await requireManager(row.event_id, userId);
    await repo.revokeLink(id);
  },

  // --------------------------------------------------------- shared view
  /** Reads only: opening the page must change nothing (see open). */
  async access(token: string): Promise<SharedAccessResult> {
    const s = await scopeOf(token);
    if (!s) throw notValid();
    return {
      eventId: s.eventId,
      role: s.role,
      kind: s.kind,
      viewer: s.viewer,
      expired: s.expired,
    };
  },

  /**
   * Counts a link view, or activates an invite. Idempotent: opening an invite
   * twice never makes two members.
   */
  async open(token: string, userId: string | null) {
    const s = await scopeOf(token);
    if (!s) throw notValid();
    if (s.expired) return;
    if (s.kind === "link") {
      await repo.countLinkView(s.row.id);
      return;
    }
    const m = s.row;
    if (m.role === "CO_ORGANIZER" && !userId)
      throw AppError.unauthenticated("Sign in to accept a co-organizer invite");
    if (m.status === "ACTIVE" && (m.user_id || !userId)) return;
    await repo.activateTeamMember(m.id, userId);
  },

  /** Everything a shared view shows, cut down to the role. Never contacts. */
  async data(token: string): Promise<SharedDataResult> {
    const s = await scopeOf(token);
    if (!s || s.expired) throw notValid();
    const out: SharedDataResult = { guests: null, arrived: null, money: null };
    if (roleCan(s.role, "attendees"))
      out.guests = (await repo.participants(s.eventId))
        .filter((p) => p.active === "Y")
        .map((p) => ({
          id: p.id,
          name: p.full_name ?? "Guest",
          category: p.category,
        }));
    if (roleCan(s.role, "checkIn") || roleCan(s.role, "overview"))
      out.arrived = await repo.checkIns(s.eventId);
    if (roleCan(s.role, "money")) {
      const m = await repo.money(s.eventId);
      out.money = {
        pendingClaims: Number(m?.pending_claims ?? 0),
        pendingAmount: Number(m?.pending_amount ?? 0),
        activeCoupons: Number(m?.active_coupons ?? 0),
      };
    }
    return out;
  },

  // ------------------------------------------------------------ check-in
  async checkIns(
    eventId: number,
    userId: string | null,
    token: string | null,
  ): Promise<number[]> {
    await checkInActor(eventId, userId, token);
    return repo.checkIns(eventId);
  },

  async setCheckIn(
    eventId: number,
    userId: string | null,
    token: string | null,
    participantId: number,
    arrived: boolean,
  ) {
    const by = await checkInActor(eventId, userId, token);
    const parts = await repo.participants(eventId);
    if (!parts.some((p) => p.id === participantId))
      throw AppError.notFound("Participant");
    if (arrived) await repo.checkIn(eventId, participantId, by);
    else await repo.undoCheckIn(eventId, participantId);
  },
};
