import { route } from "@/server/http/handler";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { roundQuerySchema } from "@/server/modules/rounds/rounds.schemas";
import { roundsService } from "@/server/modules/rounds/rounds.service";

// GET /api/v1/events/:id/round-scores?roundId= → { data: RoundScore[] }
// (organizers and accepted panelists; full history, latest wins)
export const GET = route(
  { params: eventIdParamsSchema, query: roundQuerySchema },
  async ({ params, query, user }) =>
    roundsService.scores(params.id, query.roundId ?? null, user),
);
