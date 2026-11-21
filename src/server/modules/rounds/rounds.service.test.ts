import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/session";

const repo = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
const participants = vi.hoisted(() => ({ getById: vi.fn() }));
const staff = vi.hoisted(() => ({ assertEventStaff: vi.fn() }));
const events = vi.hoisted(() => ({ exists: vi.fn() }));

vi.mock("./rounds.repository", () => ({ roundsRepository: repo }));
vi.mock("@/server/modules/participants/participants.repository", () => ({
  participantsRepository: participants,
}));
vi.mock("@/server/modules/panelists/panelists.service", () => staff);
vi.mock("@/server/modules/events/events.repository", () => ({
  eventsRepository: events,
}));

const { roundsService: svc } = await import("./rounds.service");

const judge: SessionUser = {
  userId: "7",
  role: "EXPERT",
  fullName: "Jo",
  email: "jo@x.com",
};

const round = {
  id: 20,
  event_id: 10,
  sort_order: 0,
  name: "Audition",
  description: null,
  mode: "OFFLINE",
  start_time: null,
  end_time: null,
  judge_weight: 70,
  audience_weight: 30,
  judge_scoring_enabled: "Y",
  audience_scoring_enabled: "N",
  rubric: JSON.stringify([
    { id: 31, round_id: 20, sort_order: 0, label: "Vocals", max_score: 10 },
  ]),
};

beforeEach(() => {
  for (const n of [
    "listRounds",
    "replaceRounds",
    "listDecisions",
    "decide",
    "listScores",
    "submitScore",
  ])
    repo[n] = vi.fn(async () => []);
  repo.listRounds.mockResolvedValue([round]);
  participants.getById.mockResolvedValue({
    id: 500,
    event_id: 10,
    category: "PARTICIPANT",
  });
  staff.assertEventStaff.mockResolvedValue("panelist");
  events.exists.mockResolvedValue(true);
});

it("lists rounds with the rubric parsed", async () => {
  const [r] = await svc.list(10);
  expect(r).toMatchObject({
    id: 20,
    mode: "OFFLINE",
    judgeScoringEnabled: true,
    audienceScoringEnabled: false,
    rubric: [{ id: 31, label: "Vocals", maxScore: 10 }],
  });
});

describe("score", () => {
  const body = { roundId: 20, criterionId: 31, score: 8 };

  it("records the scorer from the session", async () => {
    await svc.score(500, body, judge);
    expect(staff.assertEventStaff).toHaveBeenCalledWith(10, judge);
    expect(repo.submitScore).toHaveBeenCalledWith({
      roundId: 20,
      criterionId: 31,
      participantId: 500,
      score: 8,
      scoredBy: "7",
    });
  });

  it("refuses a score above the criterion's max", async () => {
    await expect(
      svc.score(500, { ...body, score: 11 }, judge),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: /out of 10/ });
    expect(repo.submitScore).not.toHaveBeenCalled();
  });

  it("refuses a criterion or round from elsewhere", async () => {
    await expect(
      svc.score(500, { ...body, criterionId: 99 }, judge),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      svc.score(500, { ...body, roundId: 21 }, judge),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(repo.submitScore).not.toHaveBeenCalled();
  });

  it("refuses non-staff", async () => {
    staff.assertEventStaff.mockRejectedValue(
      Object.assign(new Error("no"), { code: "FORBIDDEN" }),
    );
    await expect(svc.score(500, body, judge)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(repo.submitScore).not.toHaveBeenCalled();
  });

  it("refuses an Attendee registration", async () => {
    participants.getById.mockResolvedValue({
      id: 500,
      event_id: 10,
      category: "ATTENDEE",
    });
    await expect(svc.score(500, body, judge)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("decide", () => {
  it("records the decider and passes notify through", async () => {
    await svc.decide(
      500,
      { roundId: 20, status: "SHORTLISTED", notify: false },
      judge,
    );
    expect(repo.decide).toHaveBeenCalledWith({
      roundId: 20,
      participantId: 500,
      status: "SHORTLISTED",
      decidedBy: "7",
      notify: false,
    });
  });

  it("404s for an unknown registration", async () => {
    participants.getById.mockResolvedValue(null);
    await expect(
      svc.decide(500, { roundId: 20, status: "REJECTED", notify: true }, judge),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

it("history lists check staff access first", async () => {
  staff.assertEventStaff.mockRejectedValue(
    Object.assign(new Error("no"), { code: "FORBIDDEN" }),
  );
  await expect(svc.scores(10, null, judge)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(svc.decisions(10, 20, judge)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(repo.listScores).not.toHaveBeenCalled();
  expect(repo.listDecisions).not.toHaveBeenCalled();
});
