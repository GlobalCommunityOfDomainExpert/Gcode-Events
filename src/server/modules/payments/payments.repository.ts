import "server-only";
import { standalone, type DbSource } from "@/server/db/transaction";

// Cashfree payments through GCODE_CASHFREE_PAYMENTS_API (Phase 1). The
// package calls Cashfree's API itself (keys in GCODE_APP_SECRETS, CF_ENV
// picks sandbox/production) and COMMITs internally — never call it inside
// transaction().

export type CreateOrderRow = {
  isFree: number; // 1/0 — the procedure's BOOLEAN can't be bound directly
  participantId: number | null;
  orderId: string | null;
  paymentSessionId: string | null;
  amount: number | null;
  currency: string | null;
  cfEnv: string | null;
};

export function createPaymentsRepository(source: DbSource = standalone) {
  return {
    async createOrder(input: {
      eventId: number;
      quantity: number;
      category: string;
      userId?: string;
      email?: string;
      fullName?: string;
      phone?: string;
      couponCode?: string;
    }): Promise<CreateOrderRow> {
      const db = await source();
      return db.call<CreateOrderRow>(
        `DECLARE v_free BOOLEAN;
         BEGIN
           gcode_cashfree_payments_api.create_order(
             p_event_id => :eventId, p_email => :email,
             p_full_name => :fullName, p_quantity => :quantity,
             p_category => :category, p_phone => :phone,
             p_user_id => TO_NUMBER(:userId), p_coupon_code => :couponCode,
             p_is_free => v_free, p_participant_id => :participantId,
             p_order_id => :orderId, p_payment_session_id => :paymentSessionId,
             p_amount => :amount, p_currency => :currency, p_cf_env => :cfEnv);
           :isFree := CASE WHEN v_free THEN 1 ELSE 0 END;
         END;`,
        {
          eventId: input.eventId,
          email: input.email ?? null,
          fullName: input.fullName ?? null,
          quantity: input.quantity,
          category: input.category,
          phone: input.phone ?? null,
          userId: input.userId ?? null,
          couponCode: input.couponCode ?? null,
          isFree: { out: "number" },
          participantId: { out: "number" },
          orderId: { out: "string" },
          paymentSessionId: { out: "string" },
          amount: { out: "number" },
          currency: { out: "string" },
          cfEnv: { out: "string" },
        },
      );
    },

    async verifyOrder(
      orderId: string,
    ): Promise<{ status: string; participantId: number | null }> {
      const db = await source();
      return db.call(
        `BEGIN gcode_cashfree_payments_api.verify_order(
           p_order_id => :orderId, p_status => :status,
           p_participant_id => :participantId); END;`,
        {
          orderId,
          status: { out: "string" },
          participantId: { out: "number" },
        },
      );
    },

    // The package checks the signature (and logs every delivery). A rejected
    // delivery (ORA-20020: bad/missing signature or payload) comes back as
    // "REJECTED"; anything else unexpected is thrown so Cashfree retries.
    async processWebhook(input: {
      payload: string;
      signature: string | null;
      timestamp: string | null;
      idempotencyKey: string | null;
    }): Promise<"OK" | "REJECTED"> {
      const db = await source();
      const out = await db.call<{ result: string }>(
        `BEGIN
           gcode_cashfree_payments_api.process_webhook(
             p_payload => :payload, p_signature => :signature,
             p_timestamp => :timestamp, p_idempotency_key => :idempotencyKey);
           :result := 'OK';
         EXCEPTION
           WHEN OTHERS THEN
             IF SQLCODE = -20020 THEN :result := 'REJECTED'; ELSE RAISE; END IF;
         END;`,
        { ...input, result: { out: "string" } },
      );
      return out.result === "OK" ? "OK" : "REJECTED";
    },
  };
}

export const paymentsRepository = createPaymentsRepository();
