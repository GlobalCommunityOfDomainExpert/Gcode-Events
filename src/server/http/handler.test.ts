import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import { DatabaseError } from "@/infrastructure/database/errors";
import type { SessionUser } from "@/server/auth/session";
import { perEmail } from "@/server/rate-limit/rate-limit";
import { route } from "./handler";

const session = vi.hoisted(() => ({ user: null as SessionUser | null }));

const limiter = vi.hoisted(() => ({ hit: vi.fn(), prune: vi.fn() }));
vi.mock("@/server/rate-limit/rate-limit.repository", () => ({
  rateLimitRepository: limiter,
}));

vi.mock("@/server/auth/session", () => ({
  getSessionUser: async () => session.user,
  isAdmin: (u: SessionUser | null) => u?.role === "ADMIN",
}));

const member: SessionUser = {
  userId: "123456789012345678901234567890",
  role: "NONE",
  fullName: "M",
};
const admin: SessionUser = { ...member, role: "ADMIN" };

function call(
  handler: ReturnType<typeof route>,
  {
    url = "http://localhost/api/v1/x",
    params = {},
    init,
  }: {
    url?: string;
    params?: Record<string, string>;
    init?: ConstructorParameters<typeof NextRequest>[1];
  } = {},
) {
  return handler(new NextRequest(url, init), {
    params: Promise.resolve(params),
  });
}

describe("route()", () => {
  beforeEach(() => {
    session.user = null;
  });

  it("wraps plain return values in { data }", async () => {
    const res = await call(
      route({ auth: "public" }, async () => ({ hello: "world" })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { hello: "world" } });
  });

  it("requires a session by default", async () => {
    const res = await call(route({}, async () => "secret"));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("gives the handler the session user, not anything from the body", async () => {
    session.user = member;
    const res = await call(
      route(
        { body: z.object({ note: z.string() }) },
        async ({ user, body }) => ({
          by: user.userId,
          note: body.note,
        }),
      ),
      {
        init: {
          method: "POST",
          body: JSON.stringify({ note: "hi", userId: "999" }),
        },
      },
    );
    expect(await res.json()).toEqual({
      data: { by: member.userId, note: "hi" },
    });
  });

  it("refuses non-admins on admin routes", async () => {
    session.user = member;
    const handler = route({ auth: "admin" }, async () => "ok");
    expect((await call(handler)).status).toBe(403);

    session.user = admin;
    expect((await call(handler)).status).toBe(200);
  });

  it("validates params and query, coercing types", async () => {
    session.user = member;
    const handler = route(
      {
        params: z.object({ id: z.coerce.number().int() }),
        query: z.object({ limit: z.coerce.number().default(10) }),
      },
      async ({ params, query }) => ({ id: params.id, limit: query.limit }),
    );

    const good = await call(handler, {
      url: "http://localhost/x?limit=5",
      params: { id: "42" },
    });
    expect(await good.json()).toEqual({ data: { id: 42, limit: 5 } });

    const bad = await call(handler, { params: { id: "abc" } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("VALIDATION");
  });

  it("rejects malformed JSON bodies", async () => {
    session.user = member;
    const res = await call(
      route({ body: z.object({}) }, async () => "ok"),
      { init: { method: "POST", body: "{not json" } },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/valid JSON/);
  });

  it("surfaces database business-rule messages and hides the rest", async () => {
    const rule = await call(
      route({ auth: "public" }, async () => {
        throw new DatabaseError("Registration has closed", "APPLICATION_ERROR");
      }),
    );
    expect(rule.status).toBe(400);
    expect((await rule.json()).error.message).toBe("Registration has closed");

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = await call(
      route({ auth: "public" }, async () => {
        throw new Error("ORA-00942: table or view does not exist");
      }),
    );
    expect(boom.status).toBe(500);
    expect(JSON.stringify(await boom.json())).not.toMatch(/ORA-/);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("rate limits after validation, with Retry-After", async () => {
    const handler = vi.fn(async () => "ok");
    const limited = route(
      {
        auth: "public",
        body: z.object({ email: z.string() }),
        rateLimit: [perEmail("t", 3, 60)],
      },
      handler,
    );
    const post = (body: string) =>
      call(limited, { init: { method: "POST", body } });

    // Invalid bodies are refused before anything is counted.
    expect((await post("{}")).status).toBe(400);
    expect(limiter.hit).not.toHaveBeenCalled();

    limiter.hit.mockResolvedValue({ hits: 4, windowStart: new Date() });
    const res = await post('{"email":"a@x.com"}');
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect((await res.json()).error.code).toBe("RATE_LIMITED");
    expect(handler).not.toHaveBeenCalled();
  });
});
