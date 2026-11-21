import { beforeEach, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
const events = vi.hoisted(() => ({ exists: vi.fn() }));

vi.mock("./live.repository", () => ({ liveRepository: repo }));
vi.mock("@/server/modules/events/events.repository", () => ({
  eventsRepository: events,
}));

const { liveService: svc } = await import("./live.service");

const state = {
  participantId: 500,
  participantName: "Bo",
  alreadyRated: 1,
  windowClosesAt: "2026-11-20T12:02:00Z",
  avgRating: 72.5,
  ratingCount: 4,
  roundId: 20,
  isIntermission: "N",
};

beforeEach(() => {
  for (const n of [
    "getState",
    "setPerformer",
    "setIntermission",
    "startRatingWindow",
    "submitRating",
    "sendRatingLinks",
    "countRatingLinkRecipients",
    "performed",
    "roundRatings",
    "submitReaction",
    "reactionsSince",
  ])
    repo[n] = vi.fn(async () => null);
  repo.getState.mockResolvedValue(state);
  events.exists.mockResolvedValue(true);
});

it("maps the live state to booleans", async () => {
  await expect(svc.state(10, 600)).resolves.toEqual({
    participantId: 500,
    participantName: "Bo",
    alreadyRated: true,
    windowClosesAt: "2026-11-20T12:02:00Z",
    avgRating: 72.5,
    ratingCount: 4,
    roundId: 20,
    isIntermission: false,
  });
  expect(repo.getState).toHaveBeenCalledWith(10, 600);
});

it("reports an empty stage", async () => {
  repo.getState.mockResolvedValue({
    participantId: null,
    participantName: null,
    alreadyRated: 0,
    windowClosesAt: null,
    avgRating: null,
    ratingCount: 0,
    roundId: null,
    isIntermission: "Y",
  });
  await expect(svc.state(10)).resolves.toMatchObject({
    participantId: null,
    alreadyRated: false,
    isIntermission: true,
  });
  expect(repo.getState).toHaveBeenCalledWith(10, null);
});

it("organizer controls return the new state", async () => {
  await expect(svc.setPerformer(10, 500)).resolves.toMatchObject({
    participantId: 500,
  });
  expect(repo.setPerformer).toHaveBeenCalledWith(10, 500, null);
  await svc.setIntermission(10, true);
  expect(repo.setIntermission).toHaveBeenCalledWith(10, true);
});

it("sendRatingLinks reports how many were emailed", async () => {
  repo.countRatingLinkRecipients.mockResolvedValue(12);
  await expect(svc.sendRatingLinks(10)).resolves.toEqual({ sent: 12 });
  expect(repo.sendRatingLinks).toHaveBeenCalledWith(10);
});

it("sendRatingLinks 404s for an unknown event", async () => {
  events.exists.mockResolvedValue(false);
  await expect(svc.sendRatingLinks(10)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(repo.sendRatingLinks).not.toHaveBeenCalled();
});

it("maps round ratings and performed lists", async () => {
  repo.roundRatings.mockResolvedValue([
    { participant_id: 500, avg_rating: 80, rating_count: 3 },
  ]);
  await expect(svc.roundRatings(10, 20)).resolves.toEqual([
    { participantId: 500, avgRating: 80, ratingCount: 3 },
  ]);
  repo.performed.mockResolvedValue([
    { participant_id: 500, performed_at: new Date("2026-11-20T12:00:00Z") },
  ]);
  await expect(svc.performed(10)).resolves.toEqual([
    { participantId: 500, performedAt: "2026-11-20T12:00:00.000Z" },
  ]);
});
