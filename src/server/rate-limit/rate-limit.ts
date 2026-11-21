import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SessionUser } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";
import { rateLimitRepository as repo } from "./rate-limit.repository";

// Per-route request limits, declared on route({ rateLimit: [...] }) and
// checked after validation, before the handler runs:
//
//   rateLimit: [perIp("otp-verify", 50, 15 * 60), perEmail("otp-verify", 10, 15 * 60)]
//
// Every rule counts the request; if any is over its limit the request gets
// 429 RATE_LIMITED with Retry-After. Counters live in the database so all
// app instances share them.

export interface RateLimitContext {
  req: NextRequest;
  user: SessionUser | null;
  body: unknown;
}

export interface RateLimitRule {
  // Bucket namespace — unique per rule, e.g. "otp-verify:email".
  name: string;
  limit: number;
  windowSec: number;
  // What to count by. null/empty skips the rule (e.g. no email in the body).
  key: (ctx: RateLimitContext) => string | null | undefined;
}

// Platform proxies (Vercel, nginx, OCI LB) set these. Without a proxy in
// front they're client-controlled — then per-IP limits are best-effort and
// the per-email rules are what hold.
export function clientIp(req: NextRequest): string | null {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || null;
}

export function perIp(
  name: string,
  limit: number,
  windowSec: number,
): RateLimitRule {
  return {
    name: `${name}:ip`,
    limit,
    windowSec,
    key: ({ req }) => clientIp(req),
  };
}

// Counts by the `email` field of the (already validated) body, so one
// address can't be hammered from many IPs.
export function perEmail(
  name: string,
  limit: number,
  windowSec: number,
): RateLimitRule {
  return {
    name: `${name}:email`,
    limit,
    windowSec,
    key: ({ body }) => {
      const email = (body as { email?: unknown } | undefined)?.email;
      return typeof email === "string" ? email.trim().toLowerCase() : null;
    },
  };
}

// Raw IPs/emails never reach the table.
function bucketKey(name: string, value: string): string {
  return `${name}:${createHash("sha256").update(value).digest("hex")}`;
}

function retryMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1
    ? "Too many attempts. Please try again in a minute."
    : `Too many attempts. Please try again in ${minutes} minutes.`;
}

const PRUNE_EVERY = 200;

export async function enforceRateLimits(
  rules: readonly RateLimitRule[],
  ctx: RateLimitContext,
): Promise<void> {
  const checks = rules.map(async (rule) => {
    const value = rule.key(ctx);
    if (!value) return 0;
    try {
      const { hits, windowStart } = await repo.hit(
        bucketKey(rule.name, value),
        rule.windowSec,
      );
      if (hits <= rule.limit) return 0;
      const elapsed = (Date.now() - windowStart.getTime()) / 1000;
      return Math.max(1, Math.ceil(rule.windowSec - elapsed));
    } catch (err) {
      // Fail open: a counter problem shouldn't take sign-in down with it.
      console.error(`[rate-limit] ${rule.name} check failed`, err);
      return 0;
    }
  });
  const retryAfter = Math.max(0, ...(await Promise.all(checks)));

  if (Math.random() < 1 / PRUNE_EVERY) {
    repo
      .prune()
      .catch((err) => console.error("[rate-limit] prune failed", err));
  }

  if (retryAfter > 0) {
    throw new AppError("RATE_LIMITED", retryMessage(retryAfter), {
      retryAfterSec: retryAfter,
    });
  }
}
