import { route } from "@/server/http/handler";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { liveService } from "@/server/modules/live/live.service";

// POST /api/v1/events/:id/rating-links → { data: { sent } } (admin)
// Emails every Attendee registration its personal rating link.
export const POST = route(
  { auth: "admin", params: eventIdParamsSchema },
  async ({ params }) => liveService.sendRatingLinks(params.id),
);
