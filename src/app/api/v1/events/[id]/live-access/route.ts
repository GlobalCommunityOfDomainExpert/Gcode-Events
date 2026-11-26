import { route } from "@/server/http/handler";
import {
  liveAccessQuerySchema,
  portalEventParamsSchema,
} from "@/server/modules/portal/portal.schemas";
import { webinarService } from "@/server/modules/portal/webinar.service";

// GET /api/v1/events/:id/live-access?t= → { data: LiveAccessResult }
// Works signed out too: the door and the event page still show the countdown
// and the organizer notice, with registered = false. `t` is the signed join
// link a guest without an account got by email.
export const GET = route(
  {
    auth: "public",
    params: portalEventParamsSchema,
    query: liveAccessQuerySchema,
  },
  async ({ params, query, user }) =>
    webinarService.access(params.id, user?.userId ?? null, query.t ?? null),
);
