import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import {
  portalIdParamsSchema,
  teamRoleBodySchema,
} from "@/server/modules/portal/portal.schemas";
import { teamService } from "@/server/modules/portal/team.service";

// PUT /api/v1/team/:id { role } → 204
export const PUT = route(
  { params: portalIdParamsSchema, body: teamRoleBodySchema },
  async ({ params, body, user }) => {
    await teamService.setRole(params.id, user.userId, body.role);
    return noContent();
  },
);

// DELETE /api/v1/team/:id → 204
export const DELETE = route(
  { params: portalIdParamsSchema },
  async ({ params, user }) => {
    await teamService.remove(params.id, user.userId);
    return noContent();
  },
);
