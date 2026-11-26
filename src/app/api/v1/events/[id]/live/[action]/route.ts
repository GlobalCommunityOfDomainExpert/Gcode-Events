import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import {
  hostActionBodySchema,
  hostActionParamsSchema,
} from "@/server/modules/portal/portal.schemas";
import { webinarService } from "@/server/modules/portal/webinar.service";

// POST /api/v1/events/:id/live/:action  (go-live | stop | record | captions |
// notice | end) { enabled?, text? } → 204. Host only; runs against the
// provider from the server.
export const POST = route(
  { params: hostActionParamsSchema, body: hostActionBodySchema },
  async ({ params, body, user, req }) => {
    await webinarService.hostAction(
      params.id,
      user.userId,
      params.action,
      body,
      process.env.PUBLIC_BASE_URL ?? req.nextUrl.origin,
    );
    return noContent();
  },
);
