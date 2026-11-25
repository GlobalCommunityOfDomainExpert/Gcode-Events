import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { submitReactionSchema } from "@/server/modules/live/live.schemas";
import { liveService } from "@/server/modules/live/live.service";

// POST /api/v1/events/:id/reactions → 204 (public, anonymous). Taps faster
// than one per second per device are dropped silently.
export const POST = route(
  { auth: "public", params: eventIdParamsSchema, body: submitReactionSchema },
  async ({ params, body }) => {
    await liveService.react({ eventId: params.id, ...body });
    return noContent();
  },
);
