import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import { sharedTokenParamsSchema } from "@/server/modules/portal/portal.schemas";
import { teamService } from "@/server/modules/portal/team.service";

// POST /api/v1/shared/:token/open → 204
// Counts a link view or activates an invite. A co-organizer invite needs the
// caller signed in; view-only roles open it anonymously.
export const POST = route(
  { auth: "public", params: sharedTokenParamsSchema },
  async ({ params, user }) => {
    await teamService.open(params.token, user?.userId ?? null);
    return noContent();
  },
);
