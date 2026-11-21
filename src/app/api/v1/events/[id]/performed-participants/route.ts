import { route } from "@/server/http/handler";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { liveService } from "@/server/modules/live/live.service";

// GET /api/v1/events/:id/performed-participants →
// { data: PerformedParticipant[] } (admin; everyone who has been on stage)
export const GET = route(
  { auth: "admin", params: eventIdParamsSchema },
  async ({ params }) => liveService.performed(params.id),
);
