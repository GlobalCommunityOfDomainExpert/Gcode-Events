import { v1Request } from "./client";
import type {
  CreatePaymentOrderBody,
  PaymentOrderResult,
  PaymentVerification,
} from "@/server/modules/payments/payments.schemas";

export type { PaymentOrderResult, PaymentVerification };

// /api/v1 paid registrations (Cashfree). Browser-only.

// The server prices the order (never send an amount) and checks every
// registration rule first; failures reject with a readable ApiError. A
// coupon covering the whole price comes back as { free: true,
// participantId } with no order to pay.
export function createPaymentOrder(
  eventId: number | string,
  body: Partial<CreatePaymentOrderBody>,
): Promise<PaymentOrderResult> {
  return v1Request(`/events/${eventId}/payment-orders`, {
    method: "POST",
    body,
  });
}

// Asks the server, which asks Cashfree, whether the order is paid —
// registering the buyer if so. Idempotent: safe to poll.
export function verifyPaymentOrder(
  orderId: string,
): Promise<PaymentVerification> {
  return v1Request(`/payment-orders/${encodeURIComponent(orderId)}/verify`, {
    method: "POST",
  });
}
