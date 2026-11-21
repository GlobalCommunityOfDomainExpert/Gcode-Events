import "server-only";
import type { Row } from "@/infrastructure/database";
import { standalone, type DbSource } from "@/server/db/transaction";

// Coupons. Writes go through GCODE_COUPONS_API (Phase 1); none of its
// procedures commit, so standalone calls rely on autocommit. Redemption
// happens inside GCODE_CASHFREE_PAYMENTS_API.create_order, not here.

export type CouponRow = {
  id: number;
  event_id: number;
  code: string;
  discount_type: string;
  discount_value: number;
  max_redemptions: number | null;
  redemption_count: number;
  valid_from: Date | null;
  valid_to: Date | null;
  is_active: number;
  created_on: Date;
  computed_status: string;
};

export interface CreateCouponInput {
  eventId: number;
  code: string;
  discountType: string;
  discountValue: number;
  maxRedemptions: number | null;
  // UTC wall-clock "yyyy-mm-ddThh:mi:ss": the columns are plain TIMESTAMPs
  // compared with SYSTIMESTAMP, which runs in UTC on this database.
  validFrom: string | null;
  validTo: string | null;
  createdBy: string;
}

export type CouponQuoteRow = {
  couponId: number | null;
  discountType: string | null;
  discountValue: number | null;
  originalAmount: number | null;
  finalAmount: number | null;
  errorCode: string | null;
};

const UTC_STAMP = `'YYYY-MM-DD"T"HH24:MI:SS'`;

export function createCouponsRepository(source: DbSource = standalone) {
  return {
    async listByEvent(eventId: number): Promise<CouponRow[]> {
      const db = await source();
      const { rows } = await db.call<{ rows: Row[] }>(
        "BEGIN gcode_coupons_api.list_coupons_for_event(:eventId, :rows); END;",
        { eventId, rows: { out: "cursor" } },
      );
      return rows as CouponRow[];
    },

    async getEventId(id: number): Promise<number | null> {
      const db = await source();
      const row = await db.queryOne<{ event_id: number }>(
        "SELECT event_id FROM gcode_coupons WHERE id = :id",
        { id },
      );
      return row?.event_id ?? null;
    },

    async create(input: CreateCouponInput): Promise<number> {
      const db = await source();
      const out = await db.call<{ id: number }>(
        `BEGIN gcode_coupons_api.create_coupon(
           p_event_id => :eventId, p_code => :code,
           p_discount_type => :discountType, p_discount_value => :discountValue,
           p_max_redemptions => :maxRedemptions,
           p_valid_from => TO_TIMESTAMP(:validFrom, ${UTC_STAMP}),
           p_valid_to => TO_TIMESTAMP(:validTo, ${UTC_STAMP}),
           p_created_by => TO_NUMBER(:createdBy),
           p_coupon_id => :id); END;`,
        { ...input, id: { out: "number" } },
      );
      return out.id;
    },

    async deactivate(id: number): Promise<void> {
      const db = await source();
      await db.call("BEGIN gcode_coupons_api.deactivate_coupon(:id); END;", {
        id,
      });
    },

    // Signed in → userId (the package looks up the account's email);
    // guest → email.
    async quote(input: {
      eventId: number;
      code: string;
      category: string;
      quantity: number;
      userId?: string;
      email?: string;
    }): Promise<CouponQuoteRow> {
      const db = await source();
      return db.call<CouponQuoteRow>(
        `BEGIN gcode_coupons_api.validate_coupon(
           p_event_id => :eventId, p_code => :code, p_email => :email,
           p_category => :category, p_quantity => :quantity,
           p_user_id => TO_NUMBER(:userId),
           p_coupon_id => :couponId, p_discount_type => :discountType,
           p_discount_value => :discountValue,
           p_original_amount => :originalAmount,
           p_final_amount => :finalAmount, p_error_code => :errorCode); END;`,
        {
          eventId: input.eventId,
          code: input.code,
          email: input.email ?? null,
          category: input.category,
          quantity: input.quantity,
          userId: input.userId ?? null,
          couponId: { out: "number" },
          discountType: { out: "string" },
          discountValue: { out: "number" },
          originalAmount: { out: "number" },
          finalAmount: { out: "number" },
          errorCode: { out: "string" },
        },
      );
    },
  };
}

export type CouponsRepository = ReturnType<typeof createCouponsRepository>;

export const couponsRepository = createCouponsRepository();
