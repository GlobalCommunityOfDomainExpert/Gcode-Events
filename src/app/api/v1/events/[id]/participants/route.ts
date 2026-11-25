import { route } from "@/server/http/handler";
import { created } from "@/server/http/responses";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { registerSchema } from "@/server/modules/participants/participants.schemas";
import { participantsService } from "@/server/modules/participants/participants.service";

// GET /api/v1/events/:id/participants → { data: Participant[] }
// Organizers (with contact details) and the event's accepted panelists
// (without).
export const GET = route(
  { params: eventIdParamsSchema },
  async ({ params, user }) => participantsService.listForStaff(params.id, user),
);

// POST /api/v1/events/:id/participants → 201 { data: { participantId } }
// Free registration: signed-in users register themselves; guests send a
// verified email + name. Paid registrations go through the payment routes.
export const POST = route(
  { auth: "public", params: eventIdParamsSchema, body: registerSchema },
  async ({ params, body, user }) =>
    created(await participantsService.register(params.id, body, user)),
);
