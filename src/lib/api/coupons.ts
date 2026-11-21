import { v1Request } from "./client";
import type {
  Coupon,
  CouponQuote,
  CreateCouponBody,
  ValidateCouponBody,
} from "@/server/modules/coupons/coupons.schemas";

export type { Coupon, CouponQuote, CreateCouponBody };

// /api/v1 coupons. Browser-only; server code calls couponsService.

// Organizer list (admin).
export function listCoupons(eventId: number | string): Promise<Coupon[]> {
  return v1Request(`/events/${eventId}/coupons`);
}

// Organizer (admin). Dates are IST days, inclusive ("yyyy-mm-dd").
export function createCoupon(
  eventId: number | string,
  body: CreateCouponBody,
): Promise<{ id: number }> {
  return v1Request(`/events/${eventId}/coupons`, { method: "POST", body });
}

// Organizer (admin) — redemptions already made are kept.
export function deactivateCoupon(couponId: number | string): Promise<void> {
  return v1Request(`/coupons/${couponId}`, {
    method: "PATCH",
    body: { active: false },
  });
}

// Pre-checkout price preview. Signed in → priced for the session's account;
// guests pass their email. Informational only: the order is priced again
// when it's created. An unusable code rejects with a readable ApiError.
export function validateCoupon(
  eventId: number | string,
  body: Partial<ValidateCouponBody> & { code: string },
): Promise<CouponQuote> {
  return v1Request(`/events/${eventId}/coupons/validate`, {
    method: "POST",
    body,
  });
}
