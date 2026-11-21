import { route } from "@/server/http/handler";
import {
  reviewUpiClaimSchema,
  upiClaimIdParamsSchema,
} from "@/server/modules/upi-claims/upi-claims.schemas";
import { upiClaimsService } from "@/server/modules/upi-claims/upi-claims.service";

// PATCH /api/v1/upi-claims/:id { status } → { data: { participantId } }
// (admin). CONFIRMED registers the claimant; REJECTED just closes the claim.
export const PATCH = route(
  { auth: "admin", params: upiClaimIdParamsSchema, body: reviewUpiClaimSchema },
  async ({ params, body, user }) =>
    upiClaimsService.review(params.id, body, user),
);
