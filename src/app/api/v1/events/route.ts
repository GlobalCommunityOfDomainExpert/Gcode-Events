import { route } from "@/server/http/handler";
import { created, paginated } from "@/server/http/responses";
import {
  listEventsQuerySchema,
  saveEventBodySchema,
} from "@/server/modules/events/events.schemas";
import { eventsService } from "@/server/modules/events/events.service";
import { eventsWriteService } from "@/server/modules/events/events.write.service";

// GET /api/v1/events?featured=&typeId=&modeId=&statusId=&categoryId=&search=&limit=&offset=
// → { data: EventSummary[], page }
export const GET = route(
  { auth: "public", query: listEventsQuerySchema },
  async ({ query }) => {
    const { items, total } = await eventsService.list(query);
    return paginated(items, {
      limit: query.limit,
      offset: query.offset,
      total,
      hasMore: query.offset + items.length < total,
    });
  },
);

// POST /api/v1/events { draft, statusId? } → 201 { data: { id } }
// Creates the event and everything in the draft in one transaction.
export const POST = route(
  { auth: "admin", body: saveEventBodySchema },
  async ({ body, user }) =>
    created(await eventsWriteService.create(body, user)),
);
