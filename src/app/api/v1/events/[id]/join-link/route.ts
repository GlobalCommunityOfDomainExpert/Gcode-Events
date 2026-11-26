import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import { perIp } from "@/server/rate-limit/rate-limit";
import {
  joinLinkBodySchema,
  portalEventParamsSchema,
} from "@/server/modules/portal/portal.schemas";
import { webinarService } from "@/server/modules/portal/webinar.service";

// POST /api/v1/events/:id/join-link { participantId? } → 204
// "Email me my join link". Works without an account (a guest just
// registered): the caller names a registration, but the link is emailed to
// the address on that registration, never to the caller.
export const POST = route(
  {
    auth: "public",
    params: portalEventParamsSchema,
    body: joinLinkBodySchema,
    rateLimit: [
      {
        // One email a minute per registration (or per signed-in account).
        name: "join-link:reg",
        limit: 1,
        windowSec: 60,
        key: ({ req, user, body }) =>
          `${req.nextUrl.pathname}|${user?.userId ?? `p${(body as { participantId?: number }).participantId ?? 0}`}`,
      },
      perIp("join-link", 20, 60 * 60),
    ],
  },
  async ({ params, body, user, req }) => {
    await webinarService.sendJoinLink(
      params.id,
      user?.userId ?? null,
      body.participantId ?? 0,
      process.env.PUBLIC_BASE_URL ?? req.nextUrl.origin,
    );
    return noContent();
  },
);
