import { route } from "@/server/http/handler";
import { created } from "@/server/http/responses";
import {
  createLinkBodySchema,
  portalEventParamsSchema,
} from "@/server/modules/portal/portal.schemas";
import { teamService } from "@/server/modules/portal/team.service";

// GET /api/v1/events/:id/share-links → { data: ShareLinkItem[] } (managers only)
export const GET = route(
  { params: portalEventParamsSchema },
  async ({ params, user }) => teamService.listLinks(params.id, user.userId),
);

// POST /api/v1/events/:id/share-links { label, role, expiry }
// → 201 { data: { id, token } }. The token is returned once.
export const POST = route(
  { params: portalEventParamsSchema, body: createLinkBodySchema },
  async ({ params, body, user }) =>
    created(
      await teamService.createLink(
        params.id,
        user.userId,
        body.label,
        body.role,
        body.expiry,
      ),
    ),
);
