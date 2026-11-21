import { route } from "@/server/http/handler";
import { perIp } from "@/server/rate-limit/rate-limit";
import { noContent } from "@/server/http/responses";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { expressInterestSchema } from "@/server/modules/interest/interest.schemas";
import { interestService } from "@/server/modules/interest/interest.service";

// POST /api/v1/events/:id/interest → 204 (public; idempotent)
export const POST = route(
  {
    auth: "public",
    params: eventIdParamsSchema,
    body: expressInterestSchema,
    rateLimit: [perIp("interest", 30, 60 * 60)],
  },
  async ({ params, body, user }) => {
    await interestService.express(params.id, body, user);
    return noContent();
  },
);
