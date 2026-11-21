// Coupons and UPI payment claims.

import { Coupon, UpiClaim } from "@/lib/event";
import type { Coupon as CouponDto } from "@/server/modules/coupons/coupons.schemas";
import type { UpiClaim as UpiClaimDto } from "@/server/modules/upi-claims/upi-claims.schemas";

// Organizer's coupon list item.
export function adaptCoupon(row: CouponDto): Coupon {
  return {
    id: String(row.id),
    eventId: String(row.eventId),
    code: row.code,
    discountType: row.discountType,
    discountValue: row.discountValue,
    maxRedemptions: row.maxRedemptions ?? undefined,
    redemptionCount: row.redemptionCount,
    validFrom: row.validFrom ?? undefined,
    validTo: row.validTo ?? undefined,
    isActive: row.active,
    createdOn: row.createdOn,
    computedStatus: row.status,
  };
}

// Organizer's UPI review queue item.
export function adaptUpiClaim(row: UpiClaimDto): UpiClaim {
  return {
    id: String(row.id),
    eventId: String(row.eventId),
    email: row.email,
    fullName: row.fullName,
    utr: row.utr,
    amountClaimed: row.amountClaimed,
    status: row.status,
    submittedOn: row.submittedOn,
    reviewedBy: row.reviewedBy ?? undefined,
    reviewedOn: row.reviewedOn ?? undefined,
    participantId:
      row.participantId != null ? String(row.participantId) : undefined,
  };
}
