import { route } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { eventsService } from "@/server/modules/events/events.service";
import { eventsWriteService } from "@/server/modules/events/events.write.service";
import { noContent } from "@/server/http/responses";

// Uploaded bytes served from our own origin: only plain raster images get
// an image type. Anything else (HTML, SVG — both can run script) is sent
// as a download so a malicious upload can't execute on this site.
const SAFE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

// GET /api/v1/events/:id/cover-image → the database-stored cover (binary).
export const GET = route(
  { auth: "public", params: eventIdParamsSchema },
  async ({ params }) => {
    const cover = await eventsService.coverImage(params.id);
    if (!cover) throw AppError.notFound("Cover image");

    const mime = cover.mime.toLowerCase();
    const safe = SAFE_IMAGE_TYPES.has(mime);
    return new Response(new Uint8Array(cover.bytes), {
      headers: {
        "Content-Type": safe ? mime : "application/octet-stream",
        ...(!safe && { "Content-Disposition": "attachment" }),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        // Re-uploads keep the same URL, so keep the cache short.
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      },
    });
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
