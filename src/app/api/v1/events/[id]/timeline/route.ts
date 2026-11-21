import { route } from "@/server/http/handler";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { eventsService } from "@/server/modules/events/events.service";

// GET /api/v1/events/:id/timeline → { data: EventTimelineEntry[] } (in display order)
export const GET = route(
  { auth: "public", params: eventIdParamsSchema },
  async ({ params }) => eventsService.timeline(params.id),
);
