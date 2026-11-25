import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isAdminRequest } from "./auth";

const SECRET = "test-secret";
const b64 = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64url");
function token(payload: object, secret = SECRET) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = createHmac("sha256", secret)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${sig}`;
}
const req = (t?: string) =>
  new NextRequest("http://x/api", {
    headers: t ? { authorization: `Bearer ${t}` } : {},
  });
const future = Math.floor(Date.now() / 1000) + 600;

describe("isAdminRequest", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it("accepts a correctly signed ADMIN token", () => {
    expect(
      isAdminRequest(req(token({ sub: "1", role: "ADMIN", exp: future }))),
    ).toBe(true);
  });
  it("rejects a non-admin role", () => {
    expect(
      isAdminRequest(req(token({ sub: "1", role: "ORGANIZER", exp: future }))),
    ).toBe(false);
  });
  it("rejects a forged token signed with another secret", () => {
    expect(
      isAdminRequest(
        req(token({ sub: "1", role: "ADMIN", exp: future }, "other")),
      ),
    ).toBe(false);
  });
  it("rejects an expired token", () => {
    expect(
      isAdminRequest(req(token({ sub: "1", role: "ADMIN", exp: 1 }))),
    ).toBe(false);
  });
  it("rejects a missing token", () => {
    expect(isAdminRequest(req())).toBe(false);
  });
  it("never grants admin when JWT_SECRET is unset", () => {
    delete process.env.JWT_SECRET;
    expect(
      isAdminRequest(req(token({ sub: "1", role: "ADMIN", exp: future }))),
    ).toBe(false);
  });
});
