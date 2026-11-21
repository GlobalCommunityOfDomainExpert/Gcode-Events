import { route } from "@/server/http/handler";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { setIntermissionSchema } from "@/server/modules/live/live.schemas";
import { liveService } from "@/server/modules/live/live.service";

// PUT /api/v1/events/:id/live-state/intermission { active } →
// { data: LiveState } (admin). Whoever was on stage stays set underneath.
export const PUT = route(
  { auth: "admin", params: eventIdParamsSchema, body: setIntermissionSchema },
  async ({ params, body }) =>
    liveService.setIntermission(params.id, body.active),
);
