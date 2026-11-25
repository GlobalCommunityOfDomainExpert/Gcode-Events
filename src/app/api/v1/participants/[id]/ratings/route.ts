import { route } from "@/server/http/handler";
import { created } from "@/server/http/responses";
import { submitRatingSchema } from "@/server/modules/live/live.schemas";
import { liveService } from "@/server/modules/live/live.service";
import { participantIdParamsSchema } from "@/server/modules/participants/participants.schemas";

// POST /api/v1/participants/:id/ratings → 201 { data: { createdOn } }
// (public; :id is the rater's Attendee registration from their rating
// link). One rating per performer, only while the window is open.
export const POST = route(
  {
    auth: "public",
    params: participantIdParamsSchema,
    body: submitRatingSchema,
  },
  async ({ params, body }) =>
    created(await liveService.rate(params.id, body.performerId, body.rating)),
);
