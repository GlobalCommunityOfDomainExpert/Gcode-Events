import { describe, expect, it } from "vitest";
import { deleteRule } from "./event-delete";

describe("deleteRule", () => {
  it("lets anyone delete a draft, whatever the count", () => {
    expect(
      deleteRule({ status: "DRAFT", registrations: 50, isAdmin: false }),
    ).toEqual({ allowed: true, draft: true, override: false });
  });
  it("lets an admin delete a published event with 0 to 2 registrations", () => {
    for (const registrations of [0, 1, 2])
      expect(
        deleteRule({ status: "PUBLISHED", registrations, isAdmin: true }),
      ).toEqual({ allowed: true, draft: false, override: false });
  });
  it("lets an admin override above 2 registrations", () => {
    expect(
      deleteRule({ status: "PUBLISHED", registrations: 40, isAdmin: true }),
    ).toEqual({ allowed: true, draft: false, override: true });
  });
  it("blocks a non-admin on a published event", () => {
    expect(
      deleteRule({ status: "PUBLISHED", registrations: 0, isAdmin: false }),
    ).toEqual({ allowed: false, reason: "not-admin" });
  });
});
