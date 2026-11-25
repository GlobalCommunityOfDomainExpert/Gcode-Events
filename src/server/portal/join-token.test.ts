import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJoinToken, signJoinToken } from "./crypto";

const inHour = () => Date.now() + 3_600_000;

describe("join link token", () => {
  beforeEach(() => {
    process.env.JOIN_LINK_SECRET = "test-join-secret";
  });
  afterEach(() => {
    delete process.env.JOIN_LINK_SECRET;
  });

  it("round-trips the registration id", () => {
    expect(readJoinToken(741, signJoinToken(741, 55, inHour()))).toBe(55);
  });
  it("is useless at another event", () => {
    expect(readJoinToken(742, signJoinToken(741, 55, inHour()))).toBe(0);
  });
  it("rejects a token for a different registration", () => {
    const [, exp, sig] = signJoinToken(741, 55, inHour()).split(".");
    expect(readJoinToken(741, `56.${exp}.${sig}`)).toBe(0);
  });
  it("rejects a tampered expiry", () => {
    const [pid, exp, sig] = signJoinToken(741, 55, inHour()).split(".");
    expect(readJoinToken(741, `${pid}.${Number(exp) + 99999}.${sig}`)).toBe(0);
  });
  it("rejects an expired token", () => {
    expect(readJoinToken(741, signJoinToken(741, 55, Date.now() - 1000))).toBe(
      0,
    );
  });
  it("rejects garbage and missing tokens", () => {
    expect(readJoinToken(741, "nope")).toBe(0);
    expect(readJoinToken(741, null)).toBe(0);
    expect(readJoinToken(741, "")).toBe(0);
  });
  it("rejects a token signed with another secret", () => {
    const t = signJoinToken(741, 55, inHour());
    process.env.JOIN_LINK_SECRET = "different";
    expect(readJoinToken(741, t)).toBe(0);
  });
});
