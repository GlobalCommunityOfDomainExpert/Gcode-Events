import { route } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { eventsService } from "@/server/modules/events/events.service";
import { eventsWriteService } from "@/server/modules/events/events.write.service";
import { noContent, storedImage } from "@/server/http/responses";

// GET /api/v1/events/:id/card-image → the database-stored 16:7 card image (binary).
export const GET = route(
  { auth: "public", params: eventIdParamsSchema },
  async ({ params }) => {
    const card = await eventsService.cardImage(params.id);
    if (!card) throw AppError.notFound("Card image");
    return storedImage(card);
  },
);

// PUT /api/v1/events/:id/card-image — raw image bytes as the body, with
// its Content-Type. → 204
export const PUT = route(
  { auth: "admin", params: eventIdParamsSchema },
  async ({ params, req }) => {
    // Refuse oversized uploads before reading them into memory.
    if (Number(req.headers.get("content-length") ?? 0) > 10 * 1024 * 1024) {
      throw AppError.badRequest("Card images must be 10 MB or smaller");
    }
    const bytes = Buffer.from(await req.arrayBuffer());
    await eventsWriteService.uploadCard(
      params.id,
      bytes,
      req.headers.get("content-type"),
    );
    return noContent();
  },
);
