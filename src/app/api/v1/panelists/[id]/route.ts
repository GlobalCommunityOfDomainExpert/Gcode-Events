import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import { panelistIdParamsSchema } from "@/server/modules/panelists/panelists.schemas";
import { panelistsService } from "@/server/modules/panelists/panelists.service";

// GET /api/v1/panelists/:id → { data: PanelistInvite } (the invited account,
// or an admin)
export const GET = route(
  { params: panelistIdParamsSchema },
  async ({ params, user }) => panelistsService.getInvite(params.id, user),
);

// DELETE /api/v1/panelists/:id → 204 (admin; revokes the invite)
export const DELETE = route(
  { auth: "admin", params: panelistIdParamsSchema },
  async ({ params }) => {
    await panelistsService.remove(params.id);
    return noContent();
  },
);
