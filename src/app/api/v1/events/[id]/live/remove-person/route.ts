import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import {
  portalEventParamsSchema,
  removePersonBodySchema,
} from "@/server/modules/portal/portal.schemas";
import { webinarService } from "@/server/modules/portal/webinar.service";

// POST /api/v1/events/:id/live/remove-person { registrationId } → 204
// Host only. The person gets no new credential.
export const POST = route(
  { params: portalEventParamsSchema, body: removePersonBodySchema },
  async ({ params, body, user }) => {
    await webinarService.removeFromRoom(
      params.id,
      user.userId,
      body.registrationId,
    );
    return noContent();
  },
);
