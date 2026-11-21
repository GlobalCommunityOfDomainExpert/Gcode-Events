import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/session";

const repo = vi.hoisted(() => ({
  expressAsUser: vi.fn(),
  expressAsGuest: vi.fn(),
}));
const events = vi.hoisted(() => ({ exists: vi.fn() }));

vi.mock("./interest.repository", () => ({ interestRepository: repo }));
vi.mock("@/server/modules/events/events.repository", () => ({
  eventsRepository: events,
}));

const { interestService: svc } = await import("./interest.service");

const user: SessionUser = {
  userId: "116215352382004518615120842979506038939",
  role: "EXPERT",
  fullName: "Jo",
  email: "jo@x.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  events.exists.mockResolvedValue(true);
});

it("signed in: uses the session's account and ignores the body", async () => {
  await svc.express(10, { email: "someone@else.com", phone: "+911234567" }, user);
  expect(repo.expressAsUser).toHaveBeenCalledWith(10, user.userId);
  expect(repo.expressAsGuest).not.toHaveBeenCalled();
});

it("guest: passes email and optional phone", async () => {
  await svc.express(10, { email: "g@x.com" }, null);
  expect(repo.expressAsGuest).toHaveBeenCalledWith(10, "g@x.com", null);
  await svc.express(10, { email: "g@x.com", phone: "+919876543210" }, null);
  expect(repo.expressAsGuest).toHaveBeenLastCalledWith(
    10,
    "g@x.com",
    "+919876543210",
  );
});

it("guest without an email is a 400", async () => {
  await expect(svc.express(10, {}, null)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  expect(repo.expressAsGuest).not.toHaveBeenCalled();
});

it("404s for an unknown event", async () => {
  events.exists.mockResolvedValue(false);
  await expect(svc.express(10, {}, user)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(repo.expressAsUser).not.toHaveBeenCalled();
});
