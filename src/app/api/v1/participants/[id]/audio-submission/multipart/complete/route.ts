import { route } from "@/server/http/handler";
import {
  multipartCompleteSchema,
  participantIdParamsSchema,
} from "@/server/modules/participants/participants.schemas";
import { participantsService } from "@/server/modules/participants/participants.service";

// POST …/multipart/complete { uploadId, parts, contentType } →
// { data: AudioSubmission }
export const POST = route(
  {
    auth: "public",
    params: participantIdParamsSchema,
    body: multipartCompleteSchema,
  },
  async ({ params, body, user }) =>
    participantsService.completeAudioUpload(params.id, body, user),
);
