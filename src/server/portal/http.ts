import { NextRequest, NextResponse } from "next/server";
import { userFromRequest } from "./auth";

// Server-only. Errors thrown with a status become {error} JSON with that
// status; anything unexpected is logged and shown as a generic message, so no
// database or provider detail reaches a browser.
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const forbidden = (m: string) => new HttpError(403, m);
export const notFound = (m: string) => new HttpError(404, m);

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler with error handling. */
export function handle<P = Record<string, never>>(
  fn: (req: NextRequest, params: P) => Promise<Response | unknown>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      const out = await fn(req, await ctx.params);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError)
        return NextResponse.json(
          { error: err.message },
          { status: err.status },
        );
      console.error("[portal]", err);
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 },
      );
    }
  };
}

/** The signed-in caller, or a 401. */
export async function requireUser(req: NextRequest): Promise<string> {
  const id = await userFromRequest(req);
  if (!id) throw new HttpError(401, "Sign in again to continue");
  return id;
}

export async function jsonBody(
  req: NextRequest,
): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const str = (v: unknown, max = 500): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export function intParam(v: string, what = "id"): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${what}`);
  return n;
}
