import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import { participantIdParamsSchema } from "@/server/modules/participants/participants.schemas";
import { participantsService } from "@/server/modules/participants/participants.service";

// GET /api/v1/participants/:id → { data: ParticipantSummary } (no contact
// details — reachable from the registration link)
export const GET = route(
  { auth: "public", params: participantIdParamsSchema },
  async ({ params }) => participantsService.get(params.id),
);

// DELETE /api/v1/participants/:id → 204 (admin; soft cancel, history kept)
export const DELETE = route(
  { auth: "admin", params: participantIdParamsSchema },
  async ({ params }) => {
    await participantsService.cancel(params.id);
    return noContent();
  },
);
