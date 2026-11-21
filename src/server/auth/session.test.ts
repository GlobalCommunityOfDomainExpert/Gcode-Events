import { describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

vi.stubEnv("AUTH_SECRET", "test-secret-that-is-at-least-32-characters-long");

const { signSession, verifySession, isAdmin } = await import("./session");

const user = {
  userId: "123456789012345678901234567890123",
  role: "ADMIN",
  fullName: "Ada",
  email: "ada@example.com",
};

describe("session tokens", () => {
  it("round-trips the user, keeping the long user id exact", async () => {
    const token = await signSession(user);
    const session = await verifySession(token);
    expect(session).toMatchObject(user);
    expect(Date.parse(session!.expiresAt!)).toBeGreaterThan(Date.now());
  });

  it("treats missing, tampered and foreign-signed tokens as signed out", async () => {
    const token = await signSession(user);
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession(token.slice(0, -2) + "xx")).toBeNull();

    const forged = await new SignJWT({ role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("some-other-secret-32-characters-long!!"));
    expect(await verifySession(forged)).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const expired = await new SignJWT({ role: "NONE" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    expect(await verifySession(expired)).toBeNull();
  });

  it("only ADMIN is admin", () => {
    expect(isAdmin(user)).toBe(true);
    expect(isAdmin({ ...user, role: "NONE" })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});
