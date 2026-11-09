import { describe, expect, it } from "vitest";
import { createSessionValue, verifySessionValue } from "./session";

describe("client dashboard session", () => {
  it("accepts a fresh value for the same event", () => {
    const v = createSessionValue("501", 1000, "s");
    expect(verifySessionValue(v, "501", 2000, "s")).toBe(true);
  });
  it("rejects another event, tampering, wrong secret, expiry and empty", () => {
    const v = createSessionValue("501", 1000, "s");
    expect(verifySessionValue(v, "502", 2000, "s")).toBe(false);
    expect(verifySessionValue(v + "0", "501", 2000, "s")).toBe(false);
    expect(verifySessionValue(v, "501", 2000, "other")).toBe(false);
    expect(verifySessionValue(v, "501", 1000 + 13 * 3600 * 1000, "s")).toBe(
      false,
    );
    expect(verifySessionValue(undefined, "501")).toBe(false);
  });
});
