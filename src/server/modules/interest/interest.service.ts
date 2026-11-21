import "server-only";
import type { SessionUser } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";
import { eventsRepository } from "@/server/modules/events/events.repository";
import { interestRepository as repo } from "./interest.repository";
import type { ExpressInterestBody } from "./interest.schemas";

export const interestService = {
  async express(
    eventId: number,
    body: ExpressInterestBody,
    user: SessionUser | null,
  ): Promise<void> {
    if (!(await eventsRepository.exists(eventId)))
      throw AppError.notFound("Event");
    // Signed in: always the session's account. (The ORDS endpoint trusted a
    // user_id from the body, so anyone could mark interest for anyone.)
    if (user) return repo.expressAsUser(eventId, user.userId);
    if (!body.email) throw AppError.badRequest("Email is required.");
    await repo.expressAsGuest(eventId, body.email, body.phone ?? null);
  },
};
