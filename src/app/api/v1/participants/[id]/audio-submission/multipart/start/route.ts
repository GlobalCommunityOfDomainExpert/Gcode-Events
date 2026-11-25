import { route } from "@/server/http/handler";
import {
  multipartStartSchema,
  participantIdParamsSchema,
} from "@/server/modules/participants/participants.schemas";
import { participantsService } from "@/server/modules/participants/participants.service";

// POST …/multipart/start { contentType } → { data: { uploadId } }
export const POST = route(
  {
    auth: "public",
    params: participantIdParamsSchema,
    body: multipartStartSchema,
  },
  async ({ params, body, user }) =>
    participantsService.startAudioUpload(params.id, body.contentType, user),
);
