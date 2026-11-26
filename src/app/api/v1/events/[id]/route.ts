import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import {
  eventIdParamsSchema,
  patchEventSchema,
  saveEventBodySchema,
} from "@/server/modules/events/events.schemas";
import { eventsDeleteService } from "@/server/modules/events/events.delete.service";
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
// A draft: its organizer, a co-organizer or an admin. Published: admins only
// (an override above 2 registrations). See eventsDeleteService.
export const DELETE = route(
  { params: eventIdParamsSchema },
  async ({ params, user }) => {
    await eventsDeleteService.remove(params.id, user);
    return noContent();
  },
);
