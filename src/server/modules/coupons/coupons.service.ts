import "server-only";
import { DatabaseError } from "@/infrastructure/database";
import type { SessionUser } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";
import { eventsRepository } from "@/server/modules/events/events.repository";
import { istDayToUtcStamp, toCoupon } from "./coupons.mapper";
import { couponsRepository as repo } from "./coupons.repository";
import type {
  CouponQuote,
  CreateCouponBody,
  DiscountType,
  ValidateCouponBody,
} from "./coupons.schemas";

// validate_coupon reports why a code can't be used through p_error_code.
const QUOTE_ERRORS: Record<string, string> = {
  NOT_FOUND: "This coupon code isn't valid for this event.",
  INACTIVE: "This coupon is no longer active.",
  NOT_YET_VALID: "This coupon isn't active yet.",
  EXPIRED: "This coupon has expired.",
  EXHAUSTED: "This coupon has been fully redeemed.",
  ALREADY_USED: "You've already used this coupon.",
};

async function assertEventExists(eventId: number) {
  if (!(await eventsRepository.exists(eventId)))
    throw AppError.notFound("Event");
}

export const couponsService = {
  // Organizer list (admin route).
  async list(eventId: number) {
    await assertEventExists(eventId);
    return (await repo.listByEvent(eventId)).map(toCoupon);
  },

  async create(eventId: number, body: CreateCouponBody, user: SessionUser) {
    await assertEventExists(eventId);
    try {
      const id = await repo.create({
        eventId,
        code: body.code,
        discountType: body.discountType,
        discountValue: body.discountValue,
        maxRedemptions: body.maxRedemptions ?? null,
        validFrom: body.validFrom ? istDayToUtcStamp(body.validFrom) : null,
        validTo: body.validTo ? istDayToUtcStamp(body.validTo, true) : null,
        createdBy: user.userId,
      });
      return { id };
    } catch (err) {
      if (DatabaseError.is(err) && err.code === "UNIQUE_VIOLATION") {
        throw new AppError(
          "CONFLICT",
          `A coupon with the code ${body.code} already exists for this event.`,
        );
      }
      throw err;
    }
  },

  async deactivate(id: number) {
    if ((await repo.getEventId(id)) === null) throw AppError.notFound("Coupon");
    await repo.deactivate(id);
  },

  // Price preview for the register page. Never trusted for the charge: the
  // order is priced again, coupon included, when it's created.
  async quote(
    eventId: number,
    body: ValidateCouponBody,
    user: SessionUser | null,
  ): Promise<CouponQuote> {
    if (!user && !body.email) {
      throw AppError.badRequest("Enter your email to apply a coupon.");
    }
    const row = await repo.quote({
      eventId,
      code: body.code,
      category: body.category,
      quantity: body.quantity,
      ...(user ? { userId: user.userId } : { email: body.email }),
    });
    if (row.errorCode) {
      throw new AppError(
        "BAD_REQUEST",
        QUOTE_ERRORS[row.errorCode] ?? "This coupon can't be used.",
        { reason: row.errorCode },
      );
    }
    return {
      couponId: row.couponId!,
      discountType: row.discountType as DiscountType,
      discountValue: row.discountValue!,
      originalAmount: row.originalAmount!,
      finalAmount: row.finalAmount!,
    };
  },
};
