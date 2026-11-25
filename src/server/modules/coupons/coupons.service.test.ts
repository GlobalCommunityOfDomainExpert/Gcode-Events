import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseError } from "@/infrastructure/database/errors";
import type { SessionUser } from "@/server/auth/session";

const repo = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
const events = vi.hoisted(() => ({ exists: vi.fn() }));

vi.mock("./coupons.repository", () => ({ couponsRepository: repo }));
vi.mock("@/server/modules/events/events.repository", () => ({
  eventsRepository: events,
}));

const { couponsService: svc } = await import("./coupons.service");
const { istDayToUtcStamp, toCoupon } = await import("./coupons.mapper");

const admin: SessionUser = {
  userId: "116215352382004518615120842979506038939",
  role: "ADMIN",
  fullName: "Ada",
  email: "ada@x.com",
};

beforeEach(() => {
  for (const n of [
    "listByEvent",
    "getEventId",
    "create",
    "deactivate",
    "quote",
  ])
    repo[n] = vi.fn(async () => null);
  repo.create.mockResolvedValue(7);
  repo.getEventId.mockResolvedValue(10);
  events.exists.mockResolvedValue(true);
});

describe("IST day dates", () => {
  it("stores a start day as its IST midnight in UTC", () => {
    expect(istDayToUtcStamp("2026-10-23")).toBe("2026-10-22T18:30:00");
  });

  it("stores an end day as the start of the next IST day", () => {
    expect(istDayToUtcStamp("2026-10-23", true)).toBe("2026-10-23T18:30:00");
    expect(istDayToUtcStamp("2026-12-31", true)).toBe("2026-12-31T18:30:00");
  });

  const row = (validFrom: string | null, validTo: string | null) => ({
    id: 1,
    event_id: 10,
    code: "X",
    discount_type: "PERCENT",
    discount_value: 10,
    max_redemptions: null,
    redemption_count: 0,
    valid_from: validFrom ? new Date(validFrom) : null,
    valid_to: validTo ? new Date(validTo) : null,
    is_active: 1,
    created_on: new Date("2026-10-01T00:00:00Z"),
    computed_status: "ACTIVE",
  });

  it("reads back the days that were stored", () => {
    const c = toCoupon(
      row("2026-10-22T18:30:00Z", "2026-10-24T18:30:00Z"), // 23rd → 24th
    );
    expect([c.validFrom, c.validTo]).toEqual(["2026-10-23", "2026-10-24"]);
  });

  it("reads older midnight-UTC rows as the day the organizer picked", () => {
    const c = toCoupon(row("2026-10-23T00:00:00Z", "2026-10-24T00:00:00Z"));
    expect([c.validFrom, c.validTo]).toEqual(["2026-10-23", "2026-10-24"]);
  });
});

describe("create", () => {
  const body = {
    code: "EARLY10",
    discountType: "PERCENT" as const,
    discountValue: 10,
    validFrom: "2026-10-23",
    validTo: "2026-10-24",
  };

  it("records the creator from the session and converts dates", async () => {
    await expect(svc.create(10, body, admin)).resolves.toEqual({ id: 7 });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: admin.userId,
        validFrom: "2026-10-22T18:30:00",
        validTo: "2026-10-24T18:30:00",
        maxRedemptions: null,
      }),
    );
  });

  it("turns a duplicate code into a 409 naming the code", async () => {
    repo.create.mockRejectedValue(
      new DatabaseError("ORA-00001", "UNIQUE_VIOLATION"),
    );
    await expect(svc.create(10, body, admin)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("EARLY10"),
    });
  });

  it("404s for an unknown event", async () => {
    events.exists.mockResolvedValue(false);
    await expect(svc.create(10, body, admin)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });
});

it("deactivate 404s for an unknown coupon", async () => {
  repo.getEventId.mockResolvedValue(null);
  await expect(svc.deactivate(5)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(repo.deactivate).not.toHaveBeenCalled();
});

describe("quote", () => {
  const ok = {
    couponId: 3,
    discountType: "FIXED",
    discountValue: 50,
    originalAmount: 200,
    finalAmount: 150,
    errorCode: null,
  };
  const body = { code: "X", quantity: 2, category: "ATTENDEE" as const };

  it("prices for the signed-in account, ignoring a body email", async () => {
    repo.quote.mockResolvedValue(ok);
    await expect(
      svc.quote(10, { ...body, email: "other@x.com" }, admin),
    ).resolves.toEqual({
      couponId: 3,
      discountType: "FIXED",
      discountValue: 50,
      originalAmount: 200,
      finalAmount: 150,
    });
    const input = repo.quote.mock.calls[0][0];
    expect(input.userId).toBe(admin.userId);
    expect(input).not.toHaveProperty("email");
  });

  it("needs an email from a guest", async () => {
    await expect(svc.quote(10, body, null)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    repo.quote.mockResolvedValue(ok);
    await svc.quote(10, { ...body, email: "g@x.com" }, null);
    expect(repo.quote.mock.calls[0][0].email).toBe("g@x.com");
  });

  it("explains why a code can't be used", async () => {
    repo.quote.mockResolvedValue({ ...ok, errorCode: "ALREADY_USED" });
    await expect(svc.quote(10, body, admin)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "You've already used this coupon.",
      details: { reason: "ALREADY_USED" },
    });
  });
});
