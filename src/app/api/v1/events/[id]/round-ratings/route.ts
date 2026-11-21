import { route } from "@/server/http/handler";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { roundRatingsQuerySchema } from "@/server/modules/live/live.schemas";
import { liveService } from "@/server/modules/live/live.service";

// GET /api/v1/events/:id/round-ratings?roundId= →
// { data: RoundRatingSummary[] } (admin; audience average per performer)
export const GET = route(
  {
    auth: "admin",
    params: eventIdParamsSchema,
    query: roundRatingsQuerySchema,
  },
  async ({ params, query }) =>
    liveService.roundRatings(params.id, query.roundId),
);
