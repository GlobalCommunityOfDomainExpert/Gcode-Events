import { route } from "@/server/http/handler";
import { sharedTokenParamsSchema } from "@/server/modules/portal/portal.schemas";
import { teamService } from "@/server/modules/portal/team.service";

// GET /api/v1/shared/:token/data → { data: SharedDataResult }
// What the role may see, filtered on the server. Never emails or phones.
export const GET = route(
  { auth: "public", params: sharedTokenParamsSchema },
  async ({ params }) => teamService.data(params.token),
);
