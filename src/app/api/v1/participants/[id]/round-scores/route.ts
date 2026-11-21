import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import { participantIdParamsSchema } from "@/server/modules/participants/participants.schemas";
import { scoreRoundSchema } from "@/server/modules/rounds/rounds.schemas";
import { roundsService } from "@/server/modules/rounds/rounds.service";

// POST /api/v1/participants/:id/round-scores → 204 (organizers and the
// event's accepted panelists). Append-only; the latest score wins.
export const POST = route(
  { params: participantIdParamsSchema, body: scoreRoundSchema },
  async ({ params, body, user }) => {
    await roundsService.score(params.id, body, user);
    return noContent();
  },
);
