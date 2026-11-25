import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import {
  panelistIdParamsSchema,
  respondToInviteSchema,
} from "@/server/modules/panelists/panelists.schemas";
import { panelistsService } from "@/server/modules/panelists/panelists.service";

// POST /api/v1/panelists/:id/response { status } → 204 (only the invited
// account — its email must match the invite)
export const POST = route(
  { params: panelistIdParamsSchema, body: respondToInviteSchema },
  async ({ params, body, user }) => {
    await panelistsService.respond(params.id, body.status, user);
    return noContent();
  },
);
