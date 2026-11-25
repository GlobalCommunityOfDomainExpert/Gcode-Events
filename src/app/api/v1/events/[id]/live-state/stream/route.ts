import type { NextRequest } from "next/server";
import { sseStream } from "@/server/http/sse";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import {
  liveStateQuerySchema,
  type LiveState,
} from "@/server/modules/live/live.schemas";
import { liveService } from "@/server/modules/live/live.service";

const POLL_MS = 2000;
const HEARTBEAT_MS = 15000;

// GET /api/v1/events/:id/live-state/stream?attendeeId= (public, SSE)
// Sends LiveState whenever it changes, and at least every 15 s as a
// heartbeat.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const params = eventIdParamsSchema.safeParse(await ctx.params);
  const query = liveStateQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!params.success || !query.success) {
    return new Response("Invalid request", { status: 400 });
  }

  let last = "";
  let lastSent = 0;
  return sseStream(req, POLL_MS, async (send) => {
    const state: LiveState = await liveService.state(
      params.data.id,
      query.data.attendeeId,
    );
    // avgRating moves with ratingCount, so it isn't compared separately.
    const key = JSON.stringify([
      state.participantId,
      state.alreadyRated,
      state.ratingCount,
      state.windowClosesAt,
      state.isIntermission,
    ]);
    if (key !== last || Date.now() - lastSent > HEARTBEAT_MS) {
      last = key;
      lastSent = Date.now();
      send(state);
    }
  });
}
