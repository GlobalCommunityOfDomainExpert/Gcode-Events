import { route } from "@/server/http/handler";
import { sharedTokenParamsSchema } from "@/server/modules/portal/portal.schemas";
import { teamService } from "@/server/modules/portal/team.service";

// GET /api/v1/shared/:token → { data: SharedAccessResult }
// Read only: opening this must change nothing (see ./open).
export const GET = route(
  { auth: "public", params: sharedTokenParamsSchema },
  async ({ params }) => teamService.access(params.token),
);
