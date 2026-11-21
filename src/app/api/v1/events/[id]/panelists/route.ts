import { route } from "@/server/http/handler";
import { created } from "@/server/http/responses";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { invitePanelistSchema } from "@/server/modules/panelists/panelists.schemas";
import { panelistsService } from "@/server/modules/panelists/panelists.service";

// GET /api/v1/events/:id/panelists → { data: Panelist[] } (admin)
export const GET = route(
  { auth: "admin", params: eventIdParamsSchema },
  async ({ params }) => panelistsService.list(params.id),
);

// POST /api/v1/events/:id/panelists { email } → 201 { data: { id } }
// (admin). Emails the invite link.
export const POST = route(
  { auth: "admin", params: eventIdParamsSchema, body: invitePanelistSchema },
  async ({ params, body, user }) =>
    created(await panelistsService.invite(params.id, body.email, user)),
);
