import type { NextRequest } from "next/server";
import { generateBotReactions } from "@/lib/reactions/bot-simulator";
import { sseStream } from "@/server/http/sse";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { eventsService } from "@/server/modules/events/events.service";
import { reactionsStreamQuerySchema } from "@/server/modules/live/live.schemas";
import { liveService } from "@/server/modules/live/live.service";

const POLL_MS = 700;

// GET /api/v1/events/:id/reactions/stream?performerId= (public, SSE)
// An append-only feed of new reactions for the performer on stage (plus
// simulated "bot" taps scaled to the audience size). Separate from
// live-state/stream: that one syncs state on change, this one pushes every
// new event, faster.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const params = eventIdParamsSchema.safeParse(await ctx.params);
  const query = reactionsStreamQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!params.success || !query.success) {
    return new Response("Invalid request", { status: 400 });
  }
  const performerId = query.data.performerId;

  let sinceId = 0;
  // Once per connection — the registered count doesn't change fast enough
  // to re-read every 700 ms. Best effort: no bots if it fails.
  let registeredCount = 0;
  return sseStream(
    req,
    POLL_MS,
    async (send) => {
      if (!performerId) return;
      const items = await liveService.reactionsSince(performerId, sinceId);
      if (items.length > 0) sinceId = items[items.length - 1].id;
      const bots = generateBotReactions(registeredCount, POLL_MS);
      if (items.length > 0 || bots.length > 0) {
        send({ performerParticipantId: performerId, items, bots });
      }
    },
    async () => {
      registeredCount = (await eventsService.get(params.data.id))
        .registeredCount;
    },
  );
}
