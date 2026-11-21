import { route } from "@/server/http/handler";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { setPerformerSchema } from "@/server/modules/live/live.schemas";
import { liveService } from "@/server/modules/live/live.service";

// PUT /api/v1/events/:id/live-state/performer → { data: LiveState } (admin)
// Brings a Participant-category entry on stage; the rating window stays
// closed until ../rating-window.
export const PUT = route(
  { auth: "admin", params: eventIdParamsSchema, body: setPerformerSchema },
  async ({ params, body }) =>
    liveService.setPerformer(params.id, body.participantId, body.roundId),
);
