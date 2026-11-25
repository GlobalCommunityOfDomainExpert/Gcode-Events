import { route } from "@/server/http/handler";
import {
  audioLinkSchema,
  participantIdParamsSchema,
} from "@/server/modules/participants/participants.schemas";
import { participantsService } from "@/server/modules/participants/participants.service";

// POST /api/v1/participants/:id/audio-submission — raw recording bytes
// (with their audio/* Content-Type) → { data: AudioSubmission }.
// Recordings over ~4 MB use the multipart/* routes instead.
export const POST = route(
  { auth: "public", params: participantIdParamsSchema },
  async ({ params, req, user }) =>
    participantsService.uploadAudio(
      params.id,
      Buffer.from(await req.arrayBuffer()),
      req.headers.get("content-type"),
      user,
    ),
);

// PUT /api/v1/participants/:id/audio-submission { url } — submit a link
// (Drive/YouTube…) instead → { data: AudioSubmission }
export const PUT = route(
  { auth: "public", params: participantIdParamsSchema, body: audioLinkSchema },
  async ({ params, body, user }) =>
    participantsService.submitAudioLink(params.id, body.url, user),
);
