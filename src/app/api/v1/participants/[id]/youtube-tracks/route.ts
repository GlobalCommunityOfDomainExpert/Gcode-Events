import { route } from "@/server/http/handler";
import { participantIdParamsSchema } from "@/server/modules/participants/participants.schemas";
import { participantsService } from "@/server/modules/participants/participants.service";

// GET /api/v1/participants/:id/youtube-tracks → { data: YoutubeTrack[] } (admin — the
// organizer's attendee drawer)
export const GET = route(
  { auth: "admin", params: participantIdParamsSchema },
  async ({ params }) => participantsService.youtubeTracks(params.id),
);
