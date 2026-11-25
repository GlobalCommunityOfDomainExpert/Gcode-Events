import { route } from "@/server/http/handler";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { liveService } from "@/server/modules/live/live.service";

// POST /api/v1/events/:id/live-state/rating-window → { data: LiveState }
// (admin). Opens the audience rating window for whoever is on stage.
export const POST = route(
  { auth: "admin", params: eventIdParamsSchema },
  async ({ params }) => liveService.startRatingWindow(params.id),
);
