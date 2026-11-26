import { route } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { getRecordingObject } from "@/infrastructure/storage/oci-object-storage";
import { checkReplaySig } from "@/server/modules/portal/portal.tokens";
import {
  portalEventParamsSchema,
  replayQuerySchema,
} from "@/server/modules/portal/portal.schemas";
import { webinarService } from "@/server/modules/portal/webinar.service";

// GET /api/v1/events/:id/replay?u=&e=&s= → the stored recording (binary,
// Range supported). The URL carries a short-lived signature made for one
// ticket holder (see webinarService.access), because a <video> tag cannot
// send credentials of its own. There is no public link to the file.
export const GET = route(
  { auth: "public", params: portalEventParamsSchema, query: replayQuerySchema },
  async ({ params, query, req }) => {
    if (!checkReplaySig(params.id, query.u, query.e, query.s))
      throw AppError.forbidden("This replay link has expired");
    const object = await webinarService.recordingObject(params.id);
    if (!object) throw AppError.notFound("Replay");
    let f;
    try {
      f = await getRecordingObject(object, req.headers.get("range"));
    } catch (err) {
      console.error("[replay]", err);
      throw new AppError("UNAVAILABLE", "Couldn't load the replay");
    }
    const headers = new Headers({
      "Content-Type": f.contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (f.contentLength) headers.set("Content-Length", f.contentLength);
    if (f.contentRange) headers.set("Content-Range", f.contentRange);
    return new Response(f.body, { status: f.status, headers });
  },
);
