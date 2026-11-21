import { route } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { eventsService } from "@/server/modules/events/events.service";
import { eventsWriteService } from "@/server/modules/events/events.write.service";
import { noContent, storedImage } from "@/server/http/responses";

// GET /api/v1/events/:id/cover-image → the database-stored cover (binary).
export const GET = route(
  { auth: "public", params: eventIdParamsSchema },
  async ({ params }) => {
    const cover = await eventsService.coverImage(params.id);
    if (!cover) throw AppError.notFound("Cover image");
    return storedImage(cover);
  },
);

// PUT /api/v1/events/:id/cover-image — raw image bytes as the body, with
// its Content-Type. → 204
export const PUT = route(
  { auth: "admin", params: eventIdParamsSchema },
  async ({ params, req }) => {
    // Refuse oversized uploads before reading them into memory.
    if (Number(req.headers.get("content-length") ?? 0) > 10 * 1024 * 1024) {
      throw AppError.badRequest("Cover images must be 10 MB or smaller");
    }
    const bytes = Buffer.from(await req.arrayBuffer());
    await eventsWriteService.uploadCover(
      params.id,
      bytes,
      req.headers.get("content-type"),
    );
    return noContent();
  },
);
