import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const repo = vi.hoisted(() => ({ hit: vi.fn(), prune: vi.fn() }));
vi.mock("./rate-limit.repository", () => ({ rateLimitRepository: repo }));

const { enforceRateLimits, perEmail, perIp, clientIp } = await import(
  "./rate-limit"
);

const req = (headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/v1/x", { method: "POST", headers });

const at = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  repo.hit.mockResolvedValue({ hits: 1, windowStart: at(0) });
  repo.prune.mockResolvedValue(undefined);
});

it("reads the client IP from proxy headers", () => {
  expect(clientIp(req({ "x-real-ip": "1.2.3.4" }))).toBe("1.2.3.4");
  expect(clientIp(req({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe(
    "5.6.7.8",
  );
  expect(clientIp(req())).toBeNull();
});

it("lets requests under the limit through", async () => {
  repo.hit.mockResolvedValue({ hits: 5, windowStart: at(10) });
  await expect(
    enforceRateLimits([perIp("x", 5, 60)], {
      req: req({ "x-real-ip": "1.2.3.4" }),
      user: null,
      body: undefined,
    }),
  ).resolves.toBeUndefined();
});

it("refuses over the limit with the seconds left in the window", async () => {
  repo.hit.mockResolvedValue({ hits: 6, windowStart: at(20) });
  await expect(
    enforceRateLimits([perIp("x", 5, 60)], {
      req: req({ "x-real-ip": "1.2.3.4" }),
      user: null,
      body: undefined,
    }),
  ).rejects.toMatchObject({
    code: "RATE_LIMITED",
    status: 429,
    details: { retryAfterSec: 40 },
    message: "Too many attempts. Please try again in a minute.",
  });
});

it("keys email rules case-insensitively and never stores the raw value", async () => {
  const ctx = (email: string) => ({
    req: req(),
    user: null,
    body: { email },
  });
  await enforceRateLimits([perEmail("otp", 10, 900)], ctx("Jo@X.com"));
  await enforceRateLimits([perEmail("otp", 10, 900)], ctx(" jo@x.com"));
  const [k1] = repo.hit.mock.calls[0];
  const [k2, win] = repo.hit.mock.calls[1];
  expect(k1).toBe(k2);
  expect(k1).toMatch(/^otp:email:[0-9a-f]{64}$/);
  expect(k1).not.toContain("jo@x.com");
  expect(win).toBe(900);
});

it("skips a rule with nothing to key on (no IP header, no email)", async () => {
  await enforceRateLimits([perIp("x", 1, 60), perEmail("x", 1, 60)], {
    req: req(),
    user: null,
    body: {},
  });
  expect(repo.hit).not.toHaveBeenCalled();
});

it("fails open when the counter can't be read", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  repo.hit.mockRejectedValue(new Error("db down"));
  await expect(
    enforceRateLimits([perIp("x", 1, 60)], {
      req: req({ "x-real-ip": "1.2.3.4" }),
      user: null,
      body: undefined,
    }),
  ).resolves.toBeUndefined();
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});
