import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseError } from "@/infrastructure/database/errors";
import type { SessionUser } from "@/server/auth/session";

const repo = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
const events = vi.hoisted(() => ({ exists: vi.fn() }));

vi.mock("./upi-claims.repository", () => ({ upiClaimsRepository: repo }));
vi.mock("@/server/modules/events/events.repository", () => ({
  eventsRepository: events,
}));

const { upiClaimsService: svc } = await import("./upi-claims.service");

const admin: SessionUser = {
  userId: "116215352382004518615120842979506038939",
  role: "ADMIN",
  fullName: "Ada",
  email: "ada@x.com",
};
const member: SessionUser = {
  userId: "7",
  role: "PARTICIPANT",
  fullName: "Bo",
  email: "bo@x.com",
};

const claim = (status = "PENDING") => ({
  id: 4,
  event_id: 10,
  email: "g@x.com",
  full_name: "G",
  utr: "123456789012",
  amount_claimed: 500,
  status,
  submitted_on: new Date("2026-11-01T10:00:00Z"),
  reviewed_by: null,
  reviewed_on: null,
  participant_id: null,
});

beforeEach(() => {
  for (const n of ["listByEvent", "getById", "submit", "confirm", "reject"])
    repo[n] = vi.fn(async () => null);
  repo.submit.mockResolvedValue(4);
  repo.confirm.mockResolvedValue(900);
  repo.getById.mockResolvedValue(claim());
  events.exists.mockResolvedValue(true);
});

describe("submit", () => {
  const body = { utr: "123456789012", amountClaimed: 500 };

  it("uses the session's name and email when signed in", async () => {
    await svc.submit(10, { ...body, email: "x@x.com", fullName: "X" }, member);
    expect(repo.submit).toHaveBeenCalledWith(
      expect.objectContaining({ email: "bo@x.com", fullName: "Bo" }),
    );
  });

  it("requires name and email from a guest", async () => {
    await expect(
      svc.submit(10, { ...body, email: "g@x.com" }, null),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await svc.submit(10, { ...body, email: "g@x.com", fullName: "G" }, null);
    expect(repo.submit).toHaveBeenCalledTimes(1);
  });

  it("409s on a UTR already claimed for the event", async () => {
    repo.submit.mockRejectedValue(
      new DatabaseError("ORA-00001", "UNIQUE_VIOLATION"),
    );
    await expect(
      svc.submit(10, { ...body, email: "g@x.com", fullName: "G" }, null),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("review", () => {
  it("confirms with the reviewer from the session", async () => {
    await expect(
      svc.review(4, { status: "CONFIRMED" }, admin),
    ).resolves.toEqual({ participantId: 900 });
    expect(repo.confirm).toHaveBeenCalledWith(4, admin.userId);
  });

  it("rejects", async () => {
    await expect(svc.review(4, { status: "REJECTED" }, admin)).resolves.toEqual(
      { participantId: null },
    );
    expect(repo.reject).toHaveBeenCalledWith(4, admin.userId);
  });

  it("refuses a claim that was already reviewed", async () => {
    repo.getById.mockResolvedValue(claim("CONFIRMED"));
    await expect(
      svc.review(4, { status: "REJECTED" }, admin),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.reject).not.toHaveBeenCalled();
  });

  it("404s for an unknown claim", async () => {
    repo.getById.mockResolvedValue(null);
    await expect(
      svc.review(4, { status: "CONFIRMED" }, admin),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

it("lists claims with reviewer ids kept as strings", async () => {
  repo.listByEvent.mockResolvedValue([
    { ...claim("CONFIRMED"), reviewed_by: admin.userId, participant_id: 900 },
  ]);
  const [c] = await svc.list(10);
  expect(c).toMatchObject({
    reviewedBy: admin.userId,
    participantId: 900,
    submittedOn: "2026-11-01T10:00:00.000Z",
  });
});
