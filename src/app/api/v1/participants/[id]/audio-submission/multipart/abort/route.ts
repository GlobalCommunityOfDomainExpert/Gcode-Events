import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import {
  multipartAbortSchema,
  participantIdParamsSchema,
} from "@/server/modules/participants/participants.schemas";
import { participantsService } from "@/server/modules/participants/participants.service";

// POST …/multipart/abort { uploadId, contentType } → 204 (best effort)
export const POST = route(
  {
    auth: "public",
    params: participantIdParamsSchema,
    body: multipartAbortSchema,
  },
  async ({ params, body, user }) => {
    await participantsService.abortAudioUpload(
      params.id,
      body.uploadId,
      body.contentType,
      user,
    );
    return noContent();
  },
);
