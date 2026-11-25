import "server-only";
import { DatabaseError } from "@/infrastructure/database";
import type { SessionUser } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";
import { eventsRepository } from "@/server/modules/events/events.repository";
import {
  upiClaimsRepository as repo,
  type UpiClaimRow,
} from "./upi-claims.repository";
import type {
  ReviewUpiClaimBody,
  SubmitUpiClaimBody,
  UpiClaim,
  UpiClaimStatus,
} from "./upi-claims.schemas";

function toUpiClaim(row: UpiClaimRow): UpiClaim {
  return {
    id: row.id,
    eventId: row.event_id,
    email: row.email,
    fullName: row.full_name,
    utr: row.utr,
    amountClaimed: row.amount_claimed,
    status: row.status as UpiClaimStatus,
    submittedOn: row.submitted_on.toISOString(),
    reviewedBy: row.reviewed_by,
    reviewedOn: row.reviewed_on?.toISOString() ?? null,
    participantId: row.participant_id,
  };
}

async function assertEventExists(eventId: number) {
  if (!(await eventsRepository.exists(eventId)))
    throw AppError.notFound("Event");
}

export const upiClaimsService = {
  // Organizer review queue (admin route).
  async list(eventId: number) {
    await assertEventExists(eventId);
    return (await repo.listByEvent(eventId)).map(toUpiClaim);
  },

  async submit(
    eventId: number,
    body: SubmitUpiClaimBody,
    user: SessionUser | null,
  ) {
    await assertEventExists(eventId);
    // Signed in: the claim is for the session's account, whatever the body
    // says. (Sessions from Google sign-in may lack an email → fall back.)
    const email = user?.email ?? body.email;
    const fullName = user?.email ? user.fullName : body.fullName;
    if (!email || !fullName) {
      throw AppError.badRequest("Name and email are required.");
    }
    try {
      const id = await repo.submit({
        eventId,
        email,
        fullName,
        utr: body.utr,
        amountClaimed: body.amountClaimed,
      });
      return { id };
    } catch (err) {
      if (DatabaseError.is(err) && err.code === "UNIQUE_VIOLATION") {
        throw new AppError(
          "CONFLICT",
          "A claim with this UTR has already been submitted for this event.",
        );
      }
      throw err;
    }
  },

  async review(id: number, body: ReviewUpiClaimBody, reviewer: SessionUser) {
    const claim = await repo.getById(id);
    if (!claim) throw AppError.notFound("Claim");
    if (claim.status !== "PENDING") {
      throw new AppError(
        "CONFLICT",
        `This claim was already ${claim.status.toLowerCase()}.`,
      );
    }
    if (body.status === "REJECTED") {
      await repo.reject(id, reviewer.userId);
      return { participantId: null };
    }
    return { participantId: await repo.confirm(id, reviewer.userId) };
  },
};
