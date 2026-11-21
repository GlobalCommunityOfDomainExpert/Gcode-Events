import "server-only";
import type { SessionUser } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";
import { paymentsRepository as repo } from "./payments.repository";
import type {
  CreatePaymentOrderBody,
  PaymentOrderResult,
  PaymentStatus,
  PaymentVerification,
} from "./payments.schemas";

// The package enforces every registration rule (window, capacity, already
// registered, verified email, phone) and raises readable ORA-20xxx
// messages, which route() passes through as 400s.
export const paymentsService = {
  async createOrder(
    eventId: number,
    body: CreatePaymentOrderBody,
    user: SessionUser | null,
  ): Promise<PaymentOrderResult> {
    // Identity from the session when signed in; the body only for guests.
    const who = user
      ? { userId: user.userId }
      : { email: body.email, fullName: body.fullName };
    const row = await repo.createOrder({
      eventId,
      ...who,
      quantity: body.quantity,
      category: body.category,
      phone: body.phone,
      couponCode: body.couponCode,
    });
    if (row.isFree === 1) {
      return { free: true, participantId: row.participantId! };
    }
    if (!row.orderId || !row.paymentSessionId) {
      throw new AppError(
        "UNAVAILABLE",
        "Couldn't start the payment. Please try again.",
      );
    }
    return {
      free: false,
      orderId: row.orderId,
      paymentSessionId: row.paymentSessionId,
      amount: row.amount!,
      currency: row.currency ?? "INR",
      env: row.cfEnv === "TEST" ? "test" : "prod",
    };
  },

  async verify(orderId: string): Promise<PaymentVerification> {
    const out = await repo.verifyOrder(orderId);
    return {
      status: out.status as PaymentStatus,
      participantId: out.participantId,
    };
  },

  // Cashfree's server-to-server notification; the package checks the
  // signature and re-reads the order from Cashfree.
  processWebhook(input: Parameters<typeof repo.processWebhook>[0]) {
    return repo.processWebhook(input);
  },
};
