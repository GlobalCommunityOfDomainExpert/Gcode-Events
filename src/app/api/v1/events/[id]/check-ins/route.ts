import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import {
  checkInBodySchema,
  checkInsQuerySchema,
  portalEventParamsSchema,
} from "@/server/modules/portal/portal.schemas";
import { teamService } from "@/server/modules/portal/team.service";

// Public routes: a manager is identified by the session; door staff can
// instead pass a CHECK_IN link or invite token. The service refuses anyone
// else.

// GET /api/v1/events/:id/check-ins?token= → { data: participantId[] }
export const GET = route(
  {
    auth: "public",
    params: portalEventParamsSchema,
    query: checkInsQuerySchema,
  },
  async ({ params, query, user }) =>
    teamService.checkIns(params.id, user?.userId ?? null, query.token ?? null),
);

// POST /api/v1/events/:id/check-ins { participantId, arrived, token? } → 204
export const POST = route(
  { auth: "public", params: portalEventParamsSchema, body: checkInBodySchema },
  async ({ params, body, user }) => {
    await teamService.setCheckIn(
      params.id,
      user?.userId ?? null,
      body.token ?? null,
      body.participantId,
      body.arrived,
    );
    return noContent();
  },
);
