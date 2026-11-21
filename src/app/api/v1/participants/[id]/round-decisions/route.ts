import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import { participantIdParamsSchema } from "@/server/modules/participants/participants.schemas";
import { decideRoundSchema } from "@/server/modules/rounds/rounds.schemas";
import { roundsService } from "@/server/modules/rounds/rounds.service";

// POST /api/v1/participants/:id/round-decisions → 204 (admin)
// Shortlist or reject an entry for a round; shortlisting emails them unless
// notify is false.
export const POST = route(
  { auth: "admin", params: participantIdParamsSchema, body: decideRoundSchema },
  async ({ params, body, user }) => {
    await roundsService.decide(params.id, body, user);
    return noContent();
  },
);
