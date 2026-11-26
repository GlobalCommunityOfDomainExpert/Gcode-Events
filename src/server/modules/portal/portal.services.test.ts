import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
const provider = vi.hoisted(() => ({
  capabilities: vi.fn(() => ({
    pause: false,
    notice: true,
    captions: false,
    restream: false,
  })),
  createRoom: vi.fn(async () => "room-1"),
  credentialFor: vi.fn(() => "jwt"),
}));

vi.mock("./portal.repository", () => ({ portalRepository: repo }));
vi.mock("./webinar.provider", () => provider);
vi.mock("@/infrastructure/storage/oci-object-storage", () => ({
  uploadRecordingObject: vi.fn(),
}));

const { teamService } = await import("./team.service");
const { webinarService } = await import("./webinar.service");
const { hashToken } = await import("./portal.tokens");

const HOUR = 3_600_000;
// UTC wall-clock text, as GCODE_PORTAL_V_EVENTS returns it.
const wall = (ms: number) => new Date(ms).toISOString().slice(0, 19);

const event = (over = {}) => ({
  id: 10,
  title: "Talk",
  organizer_id: "1",
  organizer_name: "Ada",
  start_ist: wall(Date.now() + 48 * HOUR),
  end_ist: wall(Date.now() + 50 * HOUR),
  ...over,
});

const webinar = (over = {}) => ({
  event_id: 10,
  audience: "livestream",
  recording: 1,
  chat: 1,
  hand_raise: 1,
  captions: 0,
  notice: null,
  restream_url: null,
  slides_url: null,
  replay_published: 0,
  is_live: 0,
  is_recording: 0,
  is_ended: 0,
  provider: "VIDEOSDK",
  room_ref: null,
  recording_url: null,
  hls_url: null,
  ...over,
});

beforeEach(() => {
  for (const k of Object.keys(repo)) delete repo[k];
  Object.assign(repo, {
    event: vi.fn(async () => event()),
    isActiveCoOrganizer: vi.fn(async () => false),
    addTeamMember: vi.fn(async () => true),
    teamMember: vi.fn(),
    setTeamRole: vi.fn(),
    addLink: vi.fn(async () => 5),
    linkByToken: vi.fn(async () => null),
    teamByToken: vi.fn(async () => null),
    countLinkView: vi.fn(),
    activateTeamMember: vi.fn(),
    participants: vi.fn(async () => []),
    checkIns: vi.fn(async () => [3]),
    checkIn: vi.fn(),
    undoCheckIn: vi.fn(),
    money: vi.fn(),
    panelists: vi.fn(async () => []),
    webinar: vi.fn(async () => webinar()),
    ensureWebinar: vi.fn(),
    updateWebinar: vi.fn(),
    isBlocked: vi.fn(async () => false),
  });
});

describe("team", () => {
  it("only managers may invite, and only the organizer adds a co-organizer", async () => {
    await expect(
      teamService.invite(10, "9", "a@b.co", "SPONSOR"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    repo.isActiveCoOrganizer.mockResolvedValue(true);
    await expect(
      teamService.invite(10, "9", "a@b.co", "CO_ORGANIZER"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { token } = await teamService.invite(10, "1", " A@B.co ", "SPONSOR");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    // Only the hash is stored, and the email is normalised.
    expect(repo.addTeamMember).toHaveBeenCalledWith(
      expect.objectContaining({ email: "a@b.co", tokenHash: hashToken(token) }),
    );
  });

  it("a second invite for the same email is a conflict", async () => {
    repo.addTeamMember.mockResolvedValue(false);
    await expect(
      teamService.invite(10, "1", "a@b.co", "SPONSOR"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("links can never grant co-organizer", async () => {
    await expect(
      teamService.createLink(10, "1", "Door", "CO_ORGANIZER", "7D"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      teamService.createLink(10, "1", "Door", "CHECK_IN", "NEVER"),
    ).resolves.toMatchObject({ id: 5 });
    expect(repo.addLink.mock.calls[0][0].expiresOn).toBeNull();
  });

  it("a revoked link is not valid, an expired one says so", async () => {
    const token = "a".repeat(64);
    repo.linkByToken.mockResolvedValueOnce({
      id: 1,
      event_id: 10,
      role: "SPONSOR",
      label: "x",
      revoked_on: "2026-01-01T00:00:00.000Z",
      expires_on: null,
    });
    await expect(teamService.access(token)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    repo.linkByToken.mockResolvedValueOnce({
      id: 1,
      event_id: 10,
      role: "SPONSOR",
      label: "x",
      revoked_on: null,
      expires_on: "2020-01-01T00:00:00.000Z",
    });
    await expect(teamService.access(token)).resolves.toMatchObject({
      expired: true,
    });
  });

  it("shared data is cut to the role", async () => {
    repo.linkByToken.mockResolvedValue({
      id: 1,
      event_id: 10,
      role: "SPONSOR",
      label: "x",
      revoked_on: null,
      expires_on: null,
    });
    const out = await teamService.data("b".repeat(64));
    expect(out).toEqual({ guests: null, arrived: [3], money: null });
    expect(repo.participants).not.toHaveBeenCalled();
  });

  it("check-in needs a manager or a CHECK_IN token for this event", async () => {
    await expect(
      teamService.setCheckIn(10, "9", null, 3, true),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    repo.linkByToken.mockResolvedValue({
      id: 1,
      event_id: 10,
      role: "CHECK_IN",
      label: "Gate",
      revoked_on: null,
      expires_on: null,
    });
    repo.participants.mockResolvedValue([{ id: 3, active: "Y" }]);
    await teamService.setCheckIn(10, null, "c".repeat(64), 3, true);
    expect(repo.checkIn).toHaveBeenCalledWith(10, 3, "link:Gate");
  });
});

describe("webinar", () => {
  it("room-shaping settings lock once doors open", async () => {
    repo.event.mockResolvedValue(event({ start_ist: wall(Date.now() - HOUR) }));
    await expect(
      webinarService.saveSettings(10, "1", { audience: "interactive" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // The notice is not room-shaping.
    await webinarService.saveSettings(10, "1", { notice: "  Back soon " });
    expect(repo.updateWebinar).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ notice: "Back soon", audience: undefined }),
    );
  });

  it("slides must be https", async () => {
    await expect(
      webinarService.saveSettings(10, "1", { slidesUrl: "http://x" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("an attendee without a ticket gets no credential", async () => {
    await expect(
      webinarService.joinCredential(10, "9", null),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("an interactive attendee waits until the host is live", async () => {
    repo.event.mockResolvedValue(
      event({ start_ist: wall(Date.now() - 10 * 60_000) }),
    );
    repo.webinar.mockResolvedValue(webinar({ audience: "interactive" }));
    repo.participants.mockResolvedValue([
      { id: 4, user_id: "9", active: "Y", category: "ATTENDEE" },
    ]);
    await expect(webinarService.joinCredential(10, "9", null)).resolves.toEqual(
      { mode: "wait" },
    );
    expect(provider.createRoom).not.toHaveBeenCalled();
  });

  it("signed-out visitors see the door but are not registered", async () => {
    const r = await webinarService.access(10, null, null);
    expect(r).toMatchObject({
      registered: false,
      role: "ATTENDEE",
      state: "EARLY",
      replay: null,
    });
  });
});
