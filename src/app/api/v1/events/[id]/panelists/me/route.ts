import { route } from "@/server/http/handler";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { panelistsService } from "@/server/modules/panelists/panelists.service";

// GET /api/v1/events/:id/panelists/me → { data: MyPanelistAccess }
// Whether the signed-in user is an accepted panelist (the judge page gate).
export const GET = route(
  { params: eventIdParamsSchema },
  async ({ params, user }) => panelistsService.myAccess(params.id, user),
);
