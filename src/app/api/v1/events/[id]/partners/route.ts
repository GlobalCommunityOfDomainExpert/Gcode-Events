import { route } from "@/server/http/handler";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { eventsService } from "@/server/modules/events/events.service";

// GET /api/v1/events/:id/partners → { data: EventPartnerItem[] } (lead brand
// first). Saved with the rest of the event through PUT /api/v1/events/:id.
export const GET = route(
  { auth: "public", params: eventIdParamsSchema },
  async ({ params }) => eventsService.partners(params.id),
);
