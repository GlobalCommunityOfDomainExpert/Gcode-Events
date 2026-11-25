import { z } from "zod";

// API contract for discount coupons. Shared with src/lib/api/coupons.ts.
//
// Dates are whole IST days, inclusive: a coupon valid from 2026-10-23 to
// 2026-10-24 works from 00:00 IST on the 23rd until 23:59 IST on the 24th.

export type DiscountType = "PERCENT" | "FIXED";

export type CouponStatus =
  "ACTIVE" | "INACTIVE" | "EXPIRED" | "SCHEDULED" | "EXHAUSTED";

// Organizer's coupon list (admin).
export interface Coupon {
  id: number;
  eventId: number;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxRedemptions: number | null;
  redemptionCount: number;
  validFrom: string | null; // yyyy-mm-dd, IST
  validTo: string | null; // yyyy-mm-dd, IST, inclusive
  active: boolean;
  createdOn: string;
  status: CouponStatus;
}

export const couponIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const isoDate = z.iso.date();

// POST /api/v1/events/:id/coupons
export const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/, "Use 3–30 letters, digits, - or _"),
    discountType: z.enum(["PERCENT", "FIXED"]),
    // GCODE_COUPONS.DISCOUNT_VALUE is NUMBER(10,2).
    discountValue: z.number().positive().max(99_999_999),
    maxRedemptions: z.number().int().positive().optional(),
    validFrom: isoDate.optional(),
    validTo: isoDate.optional(),
  })
  .refine((c) => c.discountType !== "PERCENT" || c.discountValue <= 100, {
    message: "A percentage can't exceed 100",
    path: ["discountValue"],
  })
  .refine((c) => !c.validFrom || !c.validTo || c.validFrom <= c.validTo, {
    message: "The end date is before the start date",
    path: ["validTo"],
  });

export type CreateCouponBody = z.infer<typeof createCouponSchema>;

// PATCH /api/v1/coupons/:id — only deactivation is supported; redemptions
// already made are kept.
export const updateCouponSchema = z.object({ active: z.literal(false) });

// POST /api/v1/events/:id/coupons/validate — the register page's price
// preview. Signed in → priced for the session's account (email ignored);
// guest → email required (one redemption per email).
export const validateCouponSchema = z.object({
  code: z.string().trim().min(1).max(30),
  quantity: z.number().int().min(1).max(100).default(1),
  category: z.enum(["ATTENDEE", "PARTICIPANT"]).default("ATTENDEE"),
  email: z.string().trim().max(320).optional(),
});

export type ValidateCouponBody = z.infer<typeof validateCouponSchema>;

// Informational: the same check runs again when the order is created, so a
// tampered response can't change what is charged.
export interface CouponQuote {
  couponId: number;
  discountType: DiscountType;
  discountValue: number;
  originalAmount: number;
  finalAmount: number;
}
