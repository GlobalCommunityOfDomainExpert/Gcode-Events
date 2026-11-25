import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { SESSION_COOKIE, signSession } from "@/server/auth/session";
import { isAdminRequest, userFromRequest } from "./auth";

const req = (cookie?: string) =>
  new NextRequest("http://x/api", {
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  });

describe("portal auth reads the login cookie", () => {
  const saved = process.env.AUTH_SECRET;
  beforeEach(() => {
    process.env.AUTH_SECRET = "x".repeat(40);
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = saved;
  });

  it("an admin session is an admin", async () => {
    const t = await signSession({ userId: "1", role: "ADMIN", fullName: "A" });
    expect(await isAdminRequest(req(t))).toBe(true);
    expect(await userFromRequest(req(t))).toBe("1");
  });

  it("any other role is not an admin", async () => {
    const t = await signSession({ userId: "2", role: "NONE", fullName: "B" });
    expect(await isAdminRequest(req(t))).toBe(false);
    expect(await userFromRequest(req(t))).toBe("2");
  });

  it("a cookie signed with another secret is nobody", async () => {
    const forged = await new SignJWT({ role: "ADMIN", name: "A" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("y".repeat(40)));
    expect(await isAdminRequest(req(forged))).toBe(false);
    expect(await userFromRequest(req(forged))).toBeNull();
  });

  it("no cookie, or a made-up one, is nobody", async () => {
    expect(await isAdminRequest(req())).toBe(false);
    expect(await userFromRequest(req("not-a-token"))).toBeNull();
  });

  it("a bearer header alone no longer counts", async () => {
    const t = await signSession({ userId: "1", role: "ADMIN", fullName: "A" });
    const viaHeader = new NextRequest("http://x/api", {
      headers: { authorization: `Bearer ${t}` },
    });
    expect(await isAdminRequest(viaHeader)).toBe(false);
  });
});
