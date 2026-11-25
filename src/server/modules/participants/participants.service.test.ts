import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { SessionUser } from "@/server/auth/session";
import type { RegisterBody } from "./participants.schemas";

// One fake repository, shared by the standalone instance and every
// "transaction".
const repo = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
const storage = vi.hoisted(
  () => ({}) as Record<string, Mock<(...a: unknown[]) => unknown>>,
);

vi.mock("@/server/db/transaction", () => ({
  transaction: async (work: (tx: unknown) => unknown) => work({}),
  within: () => () => Promise.resolve({}),
}));
vi.mock("./participants.repository", () => ({
  createParticipantsRepository: () => repo,
  participantsRepository: repo,
}));
const staff = vi.hoisted(() => ({ assertEventStaff: vi.fn() }));
vi.mock("@/server/modules/panelists/panelists.service", () => staff);
vi.mock("@/infrastructure/storage/oci-object-storage", () => ({
  uploadAudioObject: (...a: unknown[]) => storage.uploadAudioObject(...a),
  startAudioMultipartUpload: (...a: unknown[]) =>
    storage.startAudioMultipartUpload(...a),
  uploadAudioPart: (...a: unknown[]) => storage.uploadAudioPart(...a),
  commitAudioMultipartUpload: (...a: unknown[]) =>
    storage.commitAudioMultipartUpload(...a),
  abortAudioMultipartUpload: (...a: unknown[]) =>
    storage.abortAudioMultipartUpload(...a),
}));

const { participantsService: svc } = await import("./participants.service");

const admin: SessionUser = {
  userId: "1",
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

const body = (over: Partial<RegisterBody> = {}): RegisterBody => ({
  quantity: 1,
  category: "ATTENDEE",
  ...over,
});

const createInput = () => repo.create.mock.calls[0][0];

function resetFakes() {
  for (const n of [
    "eventExists",
    "findActiveRegistration",
    "create",
    "getById",
    "replaceAnswers",
    "saveAdvancedAnswers",
    "submitAudio",
  ])
    repo[n] = vi.fn(async () => null);
  repo.eventExists.mockResolvedValue(true);
  repo.create.mockResolvedValue(500);
  repo.getById.mockResolvedValue({ id: 500, user_id: "7" });
  repo.submitAudio.mockResolvedValue(new Date("2026-11-17T10:00:00Z"));
  for (const n of [
    "uploadAudioObject",
    "startAudioMultipartUpload",
    "uploadAudioPart",
    "commitAudioMultipartUpload",
    "abortAudioMultipartUpload",
  ])
    storage[n] = vi.fn(async () => "x");
}

beforeEach(resetFakes);

describe("register", () => {
  it("registers a signed-in user as themselves, ignoring body identity", async () => {
    await expect(
      svc.register(10, body({ email: "evil@x.com", fullName: "E" }), member),
    ).resolves.toEqual({ participantId: 500 });
    expect(createInput()).toMatchObject({ eventId: 10, userId: "7" });
    expect(createInput()).not.toHaveProperty("email");
  });

  it("lets an admin register someone else by email", async () => {
    await svc.register(10, body({ email: "g@x.com", fullName: "G" }), admin);
    expect(createInput()).toMatchObject({ email: "g@x.com", fullName: "G" });
    expect(createInput()).not.toHaveProperty("userId");
  });

  it("registers an admin as themselves when no email is given", async () => {
    await svc.register(10, body(), admin);
    expect(createInput()).toMatchObject({ userId: "1" });
  });

  it("requires email and name from a guest", async () => {
    await expect(
      svc.register(10, body({ email: "g@x.com" }), null),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      svc.register(10, body({ fullName: "G" }), null),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(repo.create).not.toHaveBeenCalled();

    await svc.register(10, body({ email: "g@x.com", fullName: "G" }), null);
    expect(createInput()).toMatchObject({ email: "g@x.com", fullName: "G" });
  });

  it.each([{ skipWindowCheck: true }, { skipEmailVerification: true }])(
    "rejects %o from non-admins",
    async (flags) => {
      for (const user of [member, null]) {
        await expect(
          svc.register(
            10,
            body({ email: "g@x.com", fullName: "G", ...flags }),
            user,
          ),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(repo.create).not.toHaveBeenCalled();
    },
  );

  it("passes skip flags through for admins", async () => {
    await svc.register(
      10,
      body({ skipWindowCheck: true, skipEmailVerification: true }),
      admin,
    );
    expect(createInput()).toMatchObject({
      skipWindowCheck: true,
      skipEmailVerification: true,
    });
  });

  it("skips email verification for exempt event 422 only", async () => {
    const guest = body({ email: "g@x.com", fullName: "G" });
    await svc.register(422, guest, null);
    await svc.register(10, guest, null);
    expect(repo.create.mock.calls[0][0].skipEmailVerification).toBe(true);
    expect(repo.create.mock.calls[1][0].skipEmailVerification).toBe(false);
    expect(repo.create.mock.calls[1][0].skipWindowCheck).toBe(false);
  });

  it("404s for an unknown event", async () => {
    repo.eventExists.mockResolvedValue(false);
    await expect(svc.register(10, body(), member)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("409s on a duplicate registration", async () => {
    repo.findActiveRegistration.mockResolvedValue({ id: 1 });
    await expect(svc.register(10, body(), member)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(repo.findActiveRegistration).toHaveBeenCalledWith(10, {
      userId: "7",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("modifying a registration", () => {
  const save = (user: SessionUser | null) =>
    svc.saveAnswers(500, { answers: [{ questionId: 1 }] }, user);

  it("allows the owner, an admin, and a signed-out link holder", async () => {
    await save(member);
    await save(admin);
    await save(null);
    expect(repo.replaceAnswers).toHaveBeenCalledTimes(3);
  });

  it("forbids another signed-in user", async () => {
    repo.getById.mockResolvedValue({ id: 500, user_id: "8" });
    await expect(save(member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.replaceAnswers).not.toHaveBeenCalled();
  });

  it("404s for an unknown registration", async () => {
    repo.getById.mockResolvedValue(null);
    await expect(save(member)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("saveAnswers", () => {
  it("writes only the lists that were sent", async () => {
    await svc.saveAnswers(
      500,
      { answers: [{ questionId: 1, optionId: 2 }] },
      member,
    );
    expect(repo.replaceAnswers).toHaveBeenCalledWith(
      500,
      JSON.stringify([{ questionId: 1, optionId: 2 }]),
    );
    expect(repo.saveAdvancedAnswers).not.toHaveBeenCalled();
  });

  it("sends isOther as 1/0", async () => {
    await svc.saveAnswers(
      500,
      {
        advancedAnswers: [
          { questionId: 1, settingId: 2, isOther: true, answerText: "x" },
          { questionId: 1, settingId: 2, isOther: false },
        ],
      },
      member,
    );
    expect(repo.replaceAnswers).not.toHaveBeenCalled();
    const items = JSON.parse(repo.saveAdvancedAnswers.mock.calls[0][1]);
    expect(items.map((i: { isOther: number }) => i.isOther)).toEqual([1, 0]);
  });
});

describe("audio uploads", () => {
  const bytes = Buffer.from("abc");

  it("uploads and records the submission", async () => {
    storage.uploadAudioObject.mockResolvedValue("https://o/500.webm");
    await expect(
      svc.uploadAudio(500, bytes, "audio/webm;codecs=opus", member),
    ).resolves.toEqual({
      audioSubmissionUrl: "https://o/500.webm",
      audioSubmittedOn: "2026-11-17T10:00:00.000Z",
    });
    expect(storage.uploadAudioObject).toHaveBeenCalledWith(
      "500",
      bytes,
      "audio/webm",
    );
    expect(repo.submitAudio).toHaveBeenCalledWith(500, "https://o/500.webm");
  });

  it("defaults a missing content type to audio/webm", async () => {
    await svc.uploadAudio(500, bytes, null, member);
    expect(storage.uploadAudioObject.mock.calls[0][2]).toBe("audio/webm");
  });

  it("rejects non-audio types", async () => {
    await expect(
      svc.uploadAudio(500, bytes, "text/html", member),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      svc.startAudioUpload(500, "image/png", member),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storage.uploadAudioObject).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized payloads", async () => {
    await expect(
      svc.uploadAudio(500, Buffer.alloc(0), "audio/webm", member),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      svc.uploadAudioPart(
        500,
        {
          uploadId: "u",
          partNum: 1,
          contentType: "audio/webm",
          bytes: Buffer.alloc(10 * 1024 * 1024 + 1),
        },
        member,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storage.uploadAudioPart).not.toHaveBeenCalled();
  });

  it("checks ownership before touching storage", async () => {
    repo.getById.mockResolvedValue({ id: 500, user_id: "8" });
    await expect(
      svc.uploadAudio(500, bytes, "audio/webm", member),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storage.uploadAudioObject).not.toHaveBeenCalled();
  });

  it("swallows abort failures", async () => {
    storage.abortAudioMultipartUpload.mockRejectedValue(new Error("gone"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      svc.abortAudioUpload(500, "u", "audio/webm", member),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("attendee list", () => {
  const row = {
    id: 500,
    event_id: 10,
    user_id: "7",
    user_name: "Bo",
    email: "bo@x.com",
    phone: "9876543210",
    quantity: 1,
    status: "PENDING",
    active: "Y",
    category: "PARTICIPANT",
  };

  beforeEach(() => {
    repo.listByEvent = vi.fn(async () => [row]);
  });

  it("gives organizers contact details", async () => {
    staff.assertEventStaff.mockResolvedValue("admin");
    const [p] = await svc.listForStaff(10, admin);
    expect(p).toMatchObject({ email: "bo@x.com", phone: "9876543210" });
    expect(staff.assertEventStaff).toHaveBeenCalledWith(10, admin);
  });

  it("hides contact details from panelists", async () => {
    staff.assertEventStaff.mockResolvedValue("panelist");
    const [p] = await svc.listForStaff(10, member);
    expect(p).toMatchObject({ id: 500, email: null, phone: null });
  });

  it("refuses everyone else", async () => {
    staff.assertEventStaff.mockRejectedValue(
      Object.assign(new Error("no"), { code: "FORBIDDEN" }),
    );
    await expect(svc.listForStaff(10, member)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(repo.listByEvent).not.toHaveBeenCalled();
  });
});
