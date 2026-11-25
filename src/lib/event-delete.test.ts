import { describe, expect, it } from "vitest";
import { deleteRule } from "./event-delete";

describe("deleteRule", () => {
  it("lets anyone delete a draft, whatever the count", () => {
    expect(
      deleteRule({ status: "DRAFT", registrations: 0, isAdmin: false }),
    ).toEqual({ allowed: true, draft: true });
  });
  it("lets an admin delete a published event with 0 to 2 registrations", () => {
    for (const registrations of [0, 1, 2])
      expect(
        deleteRule({ status: "PUBLISHED", registrations, isAdmin: true }),
      ).toEqual({ allowed: true, draft: false });
  });
  it("blocks a non-admin on a published event", () => {
    expect(
      deleteRule({ status: "PUBLISHED", registrations: 0, isAdmin: false }),
    ).toEqual({ allowed: false, reason: "not-admin" });
  });
  it("blocks a published event with 3 or more registrations", () => {
    expect(
      deleteRule({ status: "PUBLISHED", registrations: 3, isAdmin: true }),
    ).toEqual({ allowed: false, reason: "has-registrations" });
  });
});
