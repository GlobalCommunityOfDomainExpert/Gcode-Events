import "server-only";
import { istDate } from "@/lib/datetime/ist";
import type { CouponRow } from "./coupons.repository";
import type { Coupon, CouponStatus, DiscountType } from "./coupons.schemas";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// "2026-10-23" (an IST day) → the UTC wall-clock string at which that day
// starts, or — for an inclusive end date — the instant the next day starts.
export function istDayToUtcStamp(day: string, end = false): string {
  const startUtc = Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS;
  return new Date(startUtc + (end ? DAY_MS : 0)).toISOString().slice(0, 19);
}

export function toCoupon(row: CouponRow): Coupon {
  return {
    id: row.id,
    eventId: row.event_id,
    code: row.code,
    discountType: row.discount_type as DiscountType,
    discountValue: row.discount_value,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    validFrom: row.valid_from ? istDate(row.valid_from.toISOString()) : null,
    // Stored as the first instant after the last valid day; step back 1 ms
    // to name that day. (Older rows store midnight UTC, which still lands on
    // the day the organizer picked.)
    validTo: row.valid_to
      ? istDate(new Date(row.valid_to.getTime() - 1).toISOString())
      : null,
    active: row.is_active === 1,
    createdOn: row.created_on.toISOString(),
    status: row.computed_status as CouponStatus,
  };
}
