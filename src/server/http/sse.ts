import "server-only";
import type { NextRequest } from "next/server";

// Server-sent events for the live pages. There's no push from the database,
// so each stream polls a service on an interval and decides what to send;
// the loop ends when the browser disconnects.
//
//   return sseStream(req, POLL_MS, async (send) => { ... send(data) ... });

export function sseStream(
  req: NextRequest,
  intervalMs: number,
  tick: (send: (data: unknown) => void) => Promise<void>,
  setup?: () => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      await setup?.().catch(() => {});
      while (!closed) {
        try {
          await tick(send);
        } catch (err) {
          // A transient DB/network error skips this tick; the next one retries.
          console.error(`[sse] ${req.nextUrl.pathname}`, err);
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
