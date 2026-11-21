import { route } from "@/server/http/handler";
import { perIp } from "@/server/rate-limit/rate-limit";
import { created } from "@/server/http/responses";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { submitUpiClaimSchema } from "@/server/modules/upi-claims/upi-claims.schemas";
import { upiClaimsService } from "@/server/modules/upi-claims/upi-claims.service";

// GET /api/v1/events/:id/upi-claims → { data: UpiClaim[] } (admin)
export const GET = route(
  { auth: "admin", params: eventIdParamsSchema },
  async ({ params }) => upiClaimsService.list(params.id),
);

// POST /api/v1/events/:id/upi-claims → 201 { data: { id } }
// Self-reported offline UPI payment, queued for the organizer to review.
export const POST = route(
  {
    auth: "public",
    params: eventIdParamsSchema,
    body: submitUpiClaimSchema,
    rateLimit: [perIp("upi-claim", 10, 60 * 60)],
  },
  async ({ params, body, user }) =>
    created(await upiClaimsService.submit(params.id, body, user)),
);
