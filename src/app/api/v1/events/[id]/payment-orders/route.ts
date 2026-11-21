import { route } from "@/server/http/handler";
import { perIp } from "@/server/rate-limit/rate-limit";
import { created } from "@/server/http/responses";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { createPaymentOrderSchema } from "@/server/modules/payments/payments.schemas";
import { paymentsService } from "@/server/modules/payments/payments.service";

// POST /api/v1/events/:id/payment-orders → 201 { data: PaymentOrderResult }
// Creates the Cashfree order for a paid registration (or registers straight
// away when a coupon covers the whole price).
export const POST = route(
  {
    auth: "public",
    params: eventIdParamsSchema,
    body: createPaymentOrderSchema,
    rateLimit: [perIp("payment-order", 20, 60 * 60)],
  },
  async ({ params, body, user }) =>
    created(await paymentsService.createOrder(params.id, body, user)),
);
