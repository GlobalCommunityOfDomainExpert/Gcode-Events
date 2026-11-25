import "server-only";
import type { NextRequest } from "next/server";
import type { z } from "zod";
import {
  getSessionUser,
  isAdmin,
  type SessionUser,
} from "@/server/auth/session";
import {
  enforceRateLimits,
  type RateLimitRule,
} from "@/server/rate-limit/rate-limit";
import { AppError, toAppError } from "./errors";
import { fail, ok } from "./responses";

// Wraps every /api/v1 handler so each route file is just "what to do", and
// auth, validation, error envelopes and logging happen the same way
// everywhere:
//
//   export const GET = route(
//     { auth: "admin", params: z.object({ id: z.coerce.number() }) },
//     async ({ params, user }) => eventsService.get(params.id, user),
//   );
//
// Returning a plain value sends `{ data: value }`; return a Response (e.g.
// from paginated()/created()) to control the shape or status yourself.

type AuthLevel = "public" | "user" | "admin";

type UserFor<A extends AuthLevel> = A extends "public"
  ? SessionUser | null
  : SessionUser;

interface RouteOptions<
  A extends AuthLevel,
  P extends z.ZodType,
  Q extends z.ZodType,
  B extends z.ZodType,
> {
  // Defaults to "user": a route has to opt in to being public.
  auth?: A;
  params?: P;
  query?: Q;
  body?: B;
  // Checked after validation (so rules can key on body fields), before the
  // handler. See src/server/rate-limit/rate-limit.ts.
  rateLimit?: readonly RateLimitRule[];
}

interface HandlerContext<A extends AuthLevel, P, Q, B> {
  req: NextRequest;
  user: UserFor<A>;
  params: P;
  query: Q;
  body: B;
}

type Infer<S> = S extends z.ZodType ? z.output<S> : undefined;

interface NextRouteContext {
  params: Promise<Record<string, string | string[] | undefined>>;
}

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("VALIDATION", "Request body must be valid JSON");
  }
}

export function route<
  A extends AuthLevel = "user",
  P extends z.ZodType = z.ZodType<undefined>,
  Q extends z.ZodType = z.ZodType<undefined>,
  B extends z.ZodType = z.ZodType<undefined>,
>(
  options: RouteOptions<A, P, Q, B>,
  handler: (
    ctx: HandlerContext<A, Infer<P>, Infer<Q>, Infer<B>>,
  ) => Promise<unknown>,
) {
  const auth = options.auth ?? "user";

  return async (req: NextRequest, ctx: NextRouteContext): Promise<Response> => {
    try {
      // Public routes still read the session so they can personalise.
      const user = await getSessionUser();
      if (auth !== "public" && !user) throw AppError.unauthenticated();
      if (auth === "admin" && !isAdmin(user)) throw AppError.forbidden();

      const params = options.params
        ? options.params.parse(await ctx.params)
        : undefined;
      const query = options.query
        ? options.query.parse(Object.fromEntries(req.nextUrl.searchParams))
        : undefined;
      const body = options.body
        ? options.body.parse(await readJson(req))
        : undefined;

      if (options.rateLimit?.length) {
        await enforceRateLimits(options.rateLimit, { req, user, body });
      }

      const result = await handler({
        req,
        user: user as UserFor<A>,
        params: params as Infer<P>,
        query: query as Infer<Q>,
        body: body as Infer<B>,
      });
      return result instanceof Response ? result : ok(result);
    } catch (err) {
      const appError = toAppError(err);
      if (appError.status >= 500) {
        console.error(`[api] ${req.method} ${req.nextUrl.pathname}`, err);
      }
      const res = fail(appError);
      const retry = (appError.details as { retryAfterSec?: number } | undefined)
        ?.retryAfterSec;
      if (appError.code === "RATE_LIMITED" && retry) {
        res.headers.set("Retry-After", String(retry));
      }
      return res;
    }
  };
}
