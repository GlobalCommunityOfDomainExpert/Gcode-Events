import { z } from "zod";
import { route } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { participantIdParamsSchema } from "@/server/modules/participants/participants.schemas";
import { participantsService } from "@/server/modules/participants/participants.service";

const partHeaders = z.object({
  uploadId: z.string().min(1).max(500),
  partNum: z.coerce.number().int().positive(),
});

// POST …/multipart/part — raw chunk bytes; X-Upload-Id, X-Part-Number and
// X-Audio-Content-Type headers → { data: { etag } }
export const POST = route(
  { auth: "public", params: participantIdParamsSchema },
  async ({ params, req, user }) => {
    const headers = partHeaders.safeParse({
      uploadId: req.headers.get("x-upload-id"),
      partNum: req.headers.get("x-part-number"),
    });
    if (!headers.success) throw AppError.badRequest("Missing upload metadata");
    return participantsService.uploadAudioPart(
      params.id,
      {
        ...headers.data,
        contentType: req.headers.get("x-audio-content-type"),
        bytes: Buffer.from(await req.arrayBuffer()),
      },
      user,
    );
  },
);
