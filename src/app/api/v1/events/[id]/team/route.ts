import { route } from "@/server/http/handler";
import { created } from "@/server/http/responses";
import {
  inviteMemberBodySchema,
  portalEventParamsSchema,
} from "@/server/modules/portal/portal.schemas";
import { teamService } from "@/server/modules/portal/team.service";

// GET /api/v1/events/:id/team → { data: TeamMemberItem[] } (managers only)
export const GET = route(
  { params: portalEventParamsSchema },
  async ({ params, user }) => teamService.list(params.id, user.userId),
);

// POST /api/v1/events/:id/team { email, role } → 201 { data: { token } }
// The invite token is returned once. Only its hash is stored.
export const POST = route(
  { params: portalEventParamsSchema, body: inviteMemberBodySchema },
  async ({ params, body, user }) =>
    created(
      await teamService.invite(params.id, user.userId, body.email, body.role),
    ),
);
