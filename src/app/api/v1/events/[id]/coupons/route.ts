import { route } from "@/server/http/handler";
import { created } from "@/server/http/responses";
import { createCouponSchema } from "@/server/modules/coupons/coupons.schemas";
import { couponsService } from "@/server/modules/coupons/coupons.service";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";

// GET /api/v1/events/:id/coupons → { data: Coupon[] } (admin)
export const GET = route(
  { auth: "admin", params: eventIdParamsSchema },
  async ({ params }) => couponsService.list(params.id),
);

// POST /api/v1/events/:id/coupons → 201 { data: { id } } (admin)
export const POST = route(
  { auth: "admin", params: eventIdParamsSchema, body: createCouponSchema },
  async ({ params, body, user }) =>
    created(await couponsService.create(params.id, body, user)),
);
