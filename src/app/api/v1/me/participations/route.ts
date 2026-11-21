import { route } from "@/server/http/handler";
import { participantsService } from "@/server/modules/participants/participants.service";

// GET /api/v1/me/participations → the signed-in user's registrations.
export const GET = route({}, async ({ user }) =>
  participantsService.listMine(user),
);
