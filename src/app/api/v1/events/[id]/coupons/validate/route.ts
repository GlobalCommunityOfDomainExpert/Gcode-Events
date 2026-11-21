import { route } from "@/server/http/handler";
import { perIp } from "@/server/rate-limit/rate-limit";
import { validateCouponSchema } from "@/server/modules/coupons/coupons.schemas";
import { couponsService } from "@/server/modules/coupons/coupons.service";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";

// POST /api/v1/events/:id/coupons/validate → { data: CouponQuote }
// Price preview before checkout; an unusable code is a 400 with
// details.reason (NOT_FOUND, EXPIRED, ALREADY_USED, ...).
export const POST = route(
  {
    auth: "public",
    params: eventIdParamsSchema,
    body: validateCouponSchema,
    // Stops coupon codes being guessed.
    rateLimit: [perIp("coupon-validate", 20, 10 * 60)],
  },
  async ({ params, body, user }) => couponsService.quote(params.id, body, user),
);
