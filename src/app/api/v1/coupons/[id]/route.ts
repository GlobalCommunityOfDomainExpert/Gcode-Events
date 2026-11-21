import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import {
  couponIdParamsSchema,
  updateCouponSchema,
} from "@/server/modules/coupons/coupons.schemas";
import { couponsService } from "@/server/modules/coupons/coupons.service";

// PATCH /api/v1/coupons/:id { active: false } → 204 (admin; deactivates,
// redemptions already made are kept)
export const PATCH = route(
  { auth: "admin", params: couponIdParamsSchema, body: updateCouponSchema },
  async ({ params }) => {
    await couponsService.deactivate(params.id);
    return noContent();
  },
);
