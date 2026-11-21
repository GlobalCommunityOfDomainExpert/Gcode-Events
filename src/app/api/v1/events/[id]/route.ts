import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import {
  eventIdParamsSchema,
  patchEventSchema,
  saveEventBodySchema,
} from "@/server/modules/events/events.schemas";
import { eventsService } from "@/server/modules/events/events.service";
import { eventsWriteService } from "@/server/modules/events/events.write.service";

// GET /api/v1/events/:id → { data: EventDetail }
export const GET = route(
  { auth: "public", params: eventIdParamsSchema },
  async ({ params }) => eventsService.get(params.id),
);

// PUT /api/v1/events/:id { draft, statusId? } → { data: { id } }
// Saves the whole editor draft (row + every child collection) atomically.
export const PUT = route(
  { auth: "admin", params: eventIdParamsSchema, body: saveEventBodySchema },
  async ({ params, body, user }) =>
    eventsWriteService.update(params.id, body, user),
);

// PATCH /api/v1/events/:id { statusId?, ratingMode?, attendeeRegistrationEnabled?,
// participantRegistrationEnabled? } → 204
export const PATCH = route(
  { auth: "admin", params: eventIdParamsSchema, body: patchEventSchema },
  async ({ params, body, user }) => {
    await eventsWriteService.patch(params.id, body, user);
    return noContent();
  },
);

// DELETE /api/v1/events/:id → 204
export const DELETE = route(
  { auth: "admin", params: eventIdParamsSchema },
  async ({ params }) => {
    await eventsWriteService.remove(params.id);
    return noContent();
  },
);
