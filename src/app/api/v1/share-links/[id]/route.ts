import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import { portalIdParamsSchema } from "@/server/modules/portal/portal.schemas";
import { teamService } from "@/server/modules/portal/team.service";

// DELETE /api/v1/share-links/:id → 204 (revokes; the row is kept)
export const DELETE = route(
  { params: portalIdParamsSchema },
  async ({ params, user }) => {
    await teamService.revokeLink(params.id, user.userId);
    return noContent();
  },
);
