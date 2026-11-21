import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import {
  participantIdParamsSchema,
  saveAnswersSchema,
} from "@/server/modules/participants/participants.schemas";
import { participantsService } from "@/server/modules/participants/participants.service";

// GET /api/v1/participants/:id/answers → { data: { answers, advancedAnswers } }
export const GET = route(
  { auth: "public", params: participantIdParamsSchema },
  async ({ params }) => participantsService.answers(params.id),
);

// PUT /api/v1/participants/:id/answers { answers?, advancedAnswers? } → 204
// Each list sent is replaced in full, both in one transaction.
export const PUT = route(
  {
    auth: "public",
    params: participantIdParamsSchema,
    body: saveAnswersSchema,
  },
  async ({ params, body, user }) => {
    await participantsService.saveAnswers(params.id, body, user);
    return noContent();
  },
);
