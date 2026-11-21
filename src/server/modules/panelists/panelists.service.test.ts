import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/session";

const repo = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
const auth = vi.hoisted(() => ({ findUserById: vi.fn() }));
const events = vi.hoisted(() => ({ exists: vi.fn() }));

vi.mock("./panelists.repository", () => ({ panelistsRepository: repo }));
vi.mock("@/server/modules/auth/auth.repository", () => ({
  getAuthRepository: async () => auth,
}));
vi.mock("@/server/modules/events/events.repository", () => ({
  eventsRepository: events,
}));

const { panelistsService: svc, assertEventStaff } =
  await import("./panelists.service");

const admin: SessionUser = {
  userId: "1",
  role: "ADMIN",
  fullName: "Ada",
  email: "ada@x.com",
};
const judge: SessionUser = {
  userId: "7",
  role: "EXPERT",
  fullName: "Jo",
  email: "Jo@X.com",
};
const stranger: SessionUser = {
  userId: "9",
  role: "EXPERT",
  fullName: "St",
  email: "st@x.com",
};

const invite = {
  id: 3,
  event_id: 10,
  event_title: "Hack",
  invited_email: "jo@x.com",
  status: "INVITED",
  invited_on: new Date("2026-11-01T00:00:00Z"),
};
const panelistRow = (over = {}) => ({
  id: 3,
  event_id: 10,
  user_id: "7",
  invited_email: "jo@x.com",
  status: "ACCEPTED",
  invited_by: "1",
  invited_on: new Date("2026-11-01T00:00:00Z"),
  responded_on: null,
  ...over,
});

beforeEach(() => {
  for (const n of ["listByEvent", "getInvite", "invite", "respond", "remove"])
    repo[n] = vi.fn(async () => null);
  repo.getInvite.mockResolvedValue(invite);
  repo.listByEvent.mockResolvedValue([]);
  repo.invite.mockResolvedValue(3);
  events.exists.mockResolvedValue(true);
  auth.findUserById.mockResolvedValue(null);
});

describe("event staff", () => {
  it("admins are staff without a lookup", async () => {
    await expect(assertEventStaff(10, admin)).resolves.toBe("admin");
    expect(repo.listByEvent).not.toHaveBeenCalled();
  });

  it("accepted panelists are staff", async () => {
    repo.listByEvent.mockResolvedValue([panelistRow()]);
    await expect(assertEventStaff(10, judge)).resolves.toBe("panelist");
  });

  it("invited-but-not-accepted and strangers are not", async () => {
    repo.listByEvent.mockResolvedValue([panelistRow({ status: "INVITED" })]);
    await expect(assertEventStaff(10, judge)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    repo.listByEvent.mockResolvedValue([panelistRow()]);
    await expect(assertEventStaff(10, stranger)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("invite responses", () => {
  it("lets the invited account answer (email case-insensitive)", async () => {
    await svc.respond(3, "ACCEPTED", judge);
    expect(repo.respond).toHaveBeenCalledWith(3, "7", "ACCEPTED");
  });

  it("refuses anyone else, admins included", async () => {
    for (const user of [stranger, admin]) {
      await expect(svc.respond(3, "ACCEPTED", user)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    expect(repo.respond).not.toHaveBeenCalled();
  });

  it("falls back to the account's email when the session has none", async () => {
    auth.findUserById.mockResolvedValue({ email: "JO@x.com" });
    await svc.respond(3, "DECLINED", { ...judge, email: undefined });
    expect(auth.findUserById).toHaveBeenCalledWith("7");
    expect(repo.respond).toHaveBeenCalled();
  });

  it("shows the invite to its invitee and to admins only", async () => {
    await expect(svc.getInvite(3, judge)).resolves.toMatchObject({
      eventTitle: "Hack",
    });
    await expect(svc.getInvite(3, admin)).resolves.toMatchObject({ id: 3 });
    await expect(svc.getInvite(3, stranger)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("404s for an unknown invite", async () => {
    repo.getInvite.mockResolvedValue(null);
    await expect(svc.respond(3, "ACCEPTED", judge)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("invite", () => {
  it("records the inviter from the session", async () => {
    await expect(svc.invite(10, "new@x.com", admin)).resolves.toEqual({
      id: 3,
    });
    expect(repo.invite).toHaveBeenCalledWith(10, "new@x.com", "1");
  });

  it("refuses a second invite to the same email", async () => {
    repo.listByEvent.mockResolvedValue([panelistRow()]);
    await expect(svc.invite(10, "jo@x.com", admin)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(repo.invite).not.toHaveBeenCalled();
  });
});

it("myAccess reports whether the caller is an accepted panelist", async () => {
  repo.listByEvent.mockResolvedValue([panelistRow()]);
  await expect(svc.myAccess(10, judge)).resolves.toEqual({
    isAcceptedPanelist: true,
  });
  await expect(svc.myAccess(10, stranger)).resolves.toEqual({
    isAcceptedPanelist: false,
  });
});
