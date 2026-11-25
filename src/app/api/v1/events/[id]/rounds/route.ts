import { route } from "@/server/http/handler";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { replaceRoundsSchema } from "@/server/modules/rounds/rounds.schemas";
import { roundsService } from "@/server/modules/rounds/rounds.service";

// GET /api/v1/events/:id/rounds → { data: EventRound[] } (public)
export const GET = route(
  { auth: "public", params: eventIdParamsSchema },
  async ({ params }) => roundsService.list(params.id),
);

// PUT /api/v1/events/:id/rounds → { data: EventRound[] } (admin; replaces
// the whole list — rounds with scores/decisions/ratings are never deleted)
export const PUT = route(
  { auth: "admin", params: eventIdParamsSchema, body: replaceRoundsSchema },
  async ({ params, body }) => roundsService.replace(params.id, body),
);
