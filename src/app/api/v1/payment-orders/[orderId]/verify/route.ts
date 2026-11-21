import { route } from "@/server/http/handler";
import { paymentOrderIdParamsSchema } from "@/server/modules/payments/payments.schemas";
import { paymentsService } from "@/server/modules/payments/payments.service";

// POST /api/v1/payment-orders/:orderId/verify → { data: PaymentVerification }
// Idempotent. Registers the buyer once Cashfree reports the order PAID for
// the stored amount; order ids are unguessable, so this can be public.
export const POST = route(
  { auth: "public", params: paymentOrderIdParamsSchema },
  async ({ params }) => paymentsService.verify(params.orderId),
);
