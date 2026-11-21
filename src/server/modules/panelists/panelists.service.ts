import "server-only";
import { DatabaseError } from "@/infrastructure/database";
import { isAdmin, type SessionUser } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";
import { getAuthRepository } from "@/server/modules/auth/auth.repository";
import { eventsRepository } from "@/server/modules/events/events.repository";
import {
  panelistsRepository as repo,
  type PanelistInviteRow,
  type PanelistRow,
} from "./panelists.repository";
import type {
  Panelist,
  PanelistInvite,
  PanelistStatus,
} from "./panelists.schemas";

function toPanelist(row: PanelistRow): Panelist {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    invitedEmail: row.invited_email,
    status: row.status as PanelistStatus,
    invitedBy: row.invited_by,
    invitedOn: row.invited_on.toISOString(),
    respondedOn: row.responded_on?.toISOString() ?? null,
  };
}

function toInvite(row: PanelistInviteRow): PanelistInvite {
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    invitedEmail: row.invited_email,
    status: row.status as PanelistStatus,
    invitedOn: row.invited_on.toISOString(),
  };
}

// Sessions from Google sign-in can lack the email claim; the account has it.
async function emailOf(user: SessionUser): Promise<string | null> {
  if (user.email) return user.email.toLowerCase();
  const account = await (await getAuthRepository()).findUserById(user.userId);
  return account?.email.toLowerCase() ?? null;
}

// Invites go to an email address; only the account with that address may
// see or answer one. (ORDS took the responder's id from the request, so
// anyone holding an invite id could make themselves a judge.) Admins may
// view any invite, but answering one links the answering account, so that's
// always the invitee's own.
async function loadOwnInvite(
  id: number,
  user: SessionUser,
  { adminMayView = false } = {},
): Promise<PanelistInviteRow> {
  const invite = await repo.getInvite(id);
  if (!invite) throw AppError.notFound("Invite");
  if (adminMayView && isAdmin(user)) return invite;
  if ((await emailOf(user)) !== invite.invited_email) {
    throw AppError.forbidden(
      "This invite was sent to a different email address. Sign in with that account to respond.",
    );
  }
  return invite;
}

export async function isAcceptedPanelist(
  eventId: number,
  user: SessionUser,
): Promise<boolean> {
  return (await repo.listByEvent(eventId)).some(
    (p) => p.status === "ACCEPTED" && p.user_id === user.userId,
  );
}

// Who may see an event's judging data: its organizers (admins) and its
// accepted panelists.
export async function assertEventStaff(
  eventId: number,
  user: SessionUser,
): Promise<"admin" | "panelist"> {
  if (isAdmin(user)) return "admin";
  if (await isAcceptedPanelist(eventId, user)) return "panelist";
  throw AppError.forbidden(
    "Only this event's organizers and judges can do that",
  );
}

export const panelistsService = {
  async list(eventId: number) {
    return (await repo.listByEvent(eventId)).map(toPanelist);
  },

  async myAccess(eventId: number, user: SessionUser) {
    return { isAcceptedPanelist: await isAcceptedPanelist(eventId, user) };
  },

  async invite(eventId: number, email: string, user: SessionUser) {
    if (!(await eventsRepository.exists(eventId)))
      throw AppError.notFound("Event");
    if (
      (await repo.listByEvent(eventId)).some((p) => p.invited_email === email)
    ) {
      throw new AppError("CONFLICT", `${email} has already been invited.`);
    }
    try {
      return { id: await repo.invite(eventId, email, user.userId) };
    } catch (err) {
      if (DatabaseError.is(err) && err.code === "UNIQUE_VIOLATION") {
        throw new AppError("CONFLICT", `${email} has already been invited.`);
      }
      throw err;
    }
  },

  async getInvite(id: number, user: SessionUser) {
    return toInvite(await loadOwnInvite(id, user, { adminMayView: true }));
  },

  async respond(id: number, status: PanelistStatus, user: SessionUser) {
    await loadOwnInvite(id, user);
    await repo.respond(id, user.userId, status);
  },

  async remove(id: number) {
    if (!(await repo.getInvite(id))) throw AppError.notFound("Invite");
    await repo.remove(id);
  },
};
