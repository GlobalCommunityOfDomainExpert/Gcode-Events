import { route } from "@/server/http/handler";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { questionsService } from "@/server/modules/questions/questions.service";

// GET /api/v1/events/:id/questions → { data: EventQuestions }
// The questions plus the advanced follow-up tree, in one response.
export const GET = route(
  { auth: "public", params: eventIdParamsSchema },
  async ({ params }) => questionsService.forEvent(params.id),
);
