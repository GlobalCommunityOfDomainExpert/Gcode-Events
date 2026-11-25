import { route } from "@/server/http/handler";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { liveStateQuerySchema } from "@/server/modules/live/live.schemas";
import { liveService } from "@/server/modules/live/live.service";

// GET /api/v1/events/:id/live-state?attendeeId= → { data: LiveState }
// (public). Pages that follow it live use ./stream instead.
export const GET = route(
  { auth: "public", params: eventIdParamsSchema, query: liveStateQuerySchema },
  async ({ params, query }) => liveService.state(params.id, query.attendeeId),
);
