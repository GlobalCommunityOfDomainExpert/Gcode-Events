import { route } from "@/server/http/handler";
import {
  joinTokenBodySchema,
  portalEventParamsSchema,
} from "@/server/modules/portal/portal.schemas";
import { webinarService } from "@/server/modules/portal/webinar.service";

// POST /api/v1/events/:id/live/token { t? } → { data: JoinInfoResult }
// A signed-in account, or the signed join link from the registration email
// (t). The service refuses when neither identifies a ticket holder.
export const POST = route(
  {
    auth: "public",
    params: portalEventParamsSchema,
    body: joinTokenBodySchema,
  },
  async ({ params, body, user }) =>
    webinarService.joinCredential(
      params.id,
      user?.userId ?? null,
      body.t ?? null,
    ),
);
