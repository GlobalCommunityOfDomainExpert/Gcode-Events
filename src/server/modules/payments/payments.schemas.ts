import { z } from "zod";

// API contract for paid registrations (Cashfree). Shared with
// src/lib/api/payments.ts.
//
// The amount is never sent by the browser: the server prices the order from
// the event (and coupon), and every registration rule is checked before any
// money moves.

// POST /api/v1/events/:id/payment-orders (public). Signed in → the session's
// account (name/email ignored); guest → email (verified via guest-otp) and
// fullName. Cashfree needs a 10-digit phone from everyone.
export const createPaymentOrderSchema = z.object({
  quantity: z.number().int().min(1).max(100).default(1),
  category: z.enum(["ATTENDEE", "PARTICIPANT"]).default("ATTENDEE"),
  email: z.string().trim().max(320).optional(),
  fullName: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  couponCode: z.string().trim().min(1).max(30).optional(),
});

export type CreatePaymentOrderBody = z.infer<typeof createPaymentOrderSchema>;

// A coupon that covers the whole price registers straight away — no order.
export type PaymentOrderResult =
  | { free: true; participantId: number }
  | {
      free: false;
      orderId: string;
      // What Cashfree's checkout.js needs.
      paymentSessionId: string;
      amount: number; // rupees
      currency: string;
      // Mode the order was created in; open checkout in the same one.
      env: "test" | "prod";
    };

export const paymentOrderIdParamsSchema = z.object({
  orderId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});

// POST /api/v1/payment-orders/:orderId/verify (public, idempotent — the
// checkout return flow polls it). The server asks Cashfree; nothing the
// browser reports is trusted.
//   PAID               registered; participantId is set
//   PENDING            not paid yet / still processing — poll again
//   FAILED             expired or terminated without payment
//   PAID_UNREGISTERED  charged, but registration failed (e.g. the event just
//                      filled up) — needs a manual refund
export type PaymentStatus = "PAID" | "PENDING" | "FAILED" | "PAID_UNREGISTERED";

export interface PaymentVerification {
  status: PaymentStatus;
  participantId: number | null;
}
