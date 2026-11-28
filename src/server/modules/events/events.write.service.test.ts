import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventDetailDataSchema, type EventDetailData } from "@/lib/zod/event";
import type { SessionUser } from "@/server/auth/session";
import type { EventQuestion } from "@/server/modules/questions/questions.schemas";

// One fake repository of each kind, shared by every "transaction".
const events = vi.hoisted(
  () => ({}) as Record<string, ReturnType<typeof vi.fn>>,
);
const questions = vi.hoisted(
  () => ({}) as Record<string, ReturnType<typeof vi.fn>>,
);
const savedQuestions = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock("@/server/db/transaction", () => ({
  transaction: async (work: (tx: unknown) => unknown) => work({}),
  within: () => () => Promise.resolve({}),
}));
vi.mock("./events.repository", () => ({
  createEventsRepository: () => events,
}));
vi.mock("@/server/modules/questions/questions.repository", () => ({
  createQuestionsRepository: () => questions,
}));
vi.mock("@/server/modules/questions/questions.service", () => ({
  listQuestions: async () => savedQuestions.value,
}));

const { eventsWriteService } = await import("./events.write.service");

const admin: SessionUser = {
  userId: "9".repeat(33),
  role: "ADMIN",
  fullName: "Ada",
  email: "ada@x.com",
};

const draft = (over: Partial<EventDetailData> = {}): EventDetailData =>
  eventDetailDataSchema.parse({ type: 1, title: "Hack", mode: 2, ...over });

function resetFakes() {
  for (const n of [
    "create",
    "update",
    "delete",
    "exists",
    "getById",
    "replaceChildren",
    "replaceRounds",
    "categoryIds",
    "assignCategory",
    "removeCategory",
    "faqCount",
    "partnerCount",
    "replacePartners",
    "setCardImageUrl",
    "setCoverImage",
    "setCardImage",
  ])
    events[n] = vi.fn(async () => null);
  events.create.mockResolvedValue(42);
  events.exists.mockResolvedValue(true);
  events.categoryIds.mockResolvedValue([]);
  events.faqCount.mockResolvedValue(0);
  events.partnerCount.mockResolvedValue(0);
  events.getById.mockResolvedValue({ stages_json: null, card_image_url: null });
  events.setCoverImage.mockResolvedValue(true);
  events.setCardImage.mockResolvedValue(true);
  for (const n of [
    "replace",
    "advancedEnabled",
    "setAdvancedEnabled",
    "saveAdvancedConfiguration",
  ])
    questions[n] = vi.fn(async () => null);
  questions.advancedEnabled.mockResolvedValue(false);
  savedQuestions.value = [];
}

const childCall = (kind: string) =>
  events.replaceChildren.mock.calls.find((c) => c[1] === kind);

beforeEach(resetFakes);

describe("create", () => {
  it("writes the row with the session user as creator and organizer", async () => {
    const result = await eventsWriteService.create(
      { draft: draft(), statusId: 3 },
      admin,
    );
    expect(result).toEqual({ id: 42 });
    const [columns, extra] = events.create.mock.calls[0];
    expect(columns).toMatchObject({
      title: "Hack",
      event_type_id: 1,
      status_id: 3,
    });
    expect(extra).toEqual({
      createdBy: "ada@x.com",
      organizerId: admin.userId,
    });
  });

  it("refuses a draft without an event type", async () => {
    await expect(
      eventsWriteService.create({ draft: draft({ type: null }) }, admin),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(events.create).not.toHaveBeenCalled();
  });

  it("replaces every child list, dropping blank entries", async () => {
    await eventsWriteService.create(
      {
        draft: draft({
          socialLinks: [
            { platform: "x", url: "https://x.com/a" },
            { platform: "x", url: "  " },
          ],
          mediaUrls: ["https://a/1.png", ""],
          categoryIds: [1, 2],
        }),
      },
      admin,
    );
    expect(JSON.parse(childCall("social_links")![2])).toEqual([
      { platform: "x", url: "https://x.com/a" },
    ]);
    expect(JSON.parse(childCall("media")![2])).toEqual([
      { url: "https://a/1.png", sortOrder: 0 },
    ]);
    expect(childCall("timeline")).toBeDefined();
    expect(events.replaceRounds).toHaveBeenCalled();
    expect(questions.replace).toHaveBeenCalled(); // always on create
    expect(events.assignCategory.mock.calls).toEqual([
      [42, 1],
      [42, 2],
    ]);
    // No FAQs now and none before → nothing to write or clear.
    expect(childCall("faqs")).toBeUndefined();
  });

  it("writes stages for any event mode, with a multi-date day's end date", async () => {
    await eventsWriteService.create({ draft: draft() }, admin);
    expect(events.create.mock.calls[0][0]).not.toHaveProperty("stages_json");

    resetFakes();
    const stages = [
      {
        label: "Day 1",
        date: "2026-12-01",
        endDate: "2026-12-03",
        mode: "ONLINE",
      },
      // Same day or earlier is one day, not a range.
      {
        label: "Day 2",
        date: "2026-12-05",
        endDate: "2026-12-05",
        mode: "ONLINE",
      },
    ];
    await eventsWriteService.create(
      { draft: draft({ stages: stages as never }) },
      admin,
    );
    const saved = JSON.parse(events.create.mock.calls[0][0].stages_json);
    expect(saved.map((s: { end_date: string }) => s.end_date)).toEqual([
      "2026-12-03",
      "",
    ]);
  });

  it("saves partners in order, dropping nameless rows and local logo previews", async () => {
    await eventsWriteService.create(
      {
        draft: draft({
          partners: [
            {
              name: " Kay Koy ",
              role: "",
              logoUrl: "blob:x",
              url: "",
              about: "",
            },
            { name: "  ", role: "Venue", logoUrl: "", url: "", about: "" },
            {
              name: "GCODE",
              role: "Powered by",
              logoUrl: "https://cdn/logo.png",
              url: "https://gcode.in",
              about: "Hosts",
            },
          ],
        }),
      },
      admin,
    );
    expect(events.replacePartners).toHaveBeenCalledWith(42, [
      {
        name: "Kay Koy",
        role: "In association with",
        logoUrl: null,
        url: null,
        about: null,
      },
      {
        name: "GCODE",
        role: "Powered by",
        logoUrl: "https://cdn/logo.png",
        url: "https://gcode.in",
        about: "Hosts",
      },
    ]);
  });

  it("leaves partners and the card image alone when there's nothing to do", async () => {
    await eventsWriteService.create({ draft: draft() }, admin);
    expect(events.replacePartners).not.toHaveBeenCalled();
    expect(events.setCardImageUrl).not.toHaveBeenCalled();
  });

  it("stores a linked card image but never a local preview", async () => {
    await eventsWriteService.create(
      { draft: draft({ cardImageUrl: "blob:preview" }) },
      admin,
    );
    expect(events.setCardImageUrl).not.toHaveBeenCalled();

    resetFakes();
    await eventsWriteService.create(
      { draft: draft({ cardImageUrl: "https://cdn/card.jpg" }) },
      admin,
    );
    expect(events.setCardImageUrl).toHaveBeenCalledWith(
      42,
      "https://cdn/card.jpg",
    );
  });
});

describe("update", () => {
  const savedQuestion: EventQuestion = {
    id: 7,
    prompt: "T-shirt size?",
    type: "RADIO",
    required: true,
    appliesTo: "PARTICIPANT",
    sortOrder: 0,
    options: [
      { id: 70, label: "S", sortOrder: 0 },
      { id: 71, label: "M", sortOrder: 1 },
    ],
  };
  const sameQuestionInDraft = {
    id: 7,
    prompt: "T-shirt size?",
    type: "RADIO",
    required: true,
    appliesTo: "PARTICIPANT",
    options: [
      { id: 70, label: "S" },
      { id: 71, label: "M" },
    ],
  };

  it("404s for an unknown event without writing", async () => {
    events.getById.mockResolvedValue(null);
    await expect(
      eventsWriteService.update(5, { draft: draft() }, admin),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(events.update).not.toHaveBeenCalled();
  });

  it("leaves unchanged questions alone so submitted answers survive", async () => {
    savedQuestions.value = [savedQuestion];
    await eventsWriteService.update(
      5,
      { draft: draft({ questions: [sameQuestionInDraft] as never }) },
      admin,
    );
    expect(questions.replace).not.toHaveBeenCalled();
    expect(events.update.mock.calls[0][2]).toBe("ada@x.com");
  });

  it("replaces the questions when they changed", async () => {
    savedQuestions.value = [savedQuestion];
    const edited = { ...sameQuestionInDraft, prompt: "Hoodie size?" };
    await eventsWriteService.update(
      5,
      { draft: draft({ questions: [edited] as never }) },
      admin,
    );
    expect(JSON.parse(questions.replace.mock.calls[0][1])[0].prompt).toBe(
      "Hoodie size?",
    );
  });

  it("diffs categories against the database", async () => {
    events.categoryIds.mockResolvedValue([1, 2]);
    await eventsWriteService.update(
      5,
      { draft: draft({ categoryIds: [2, 3] }) },
      admin,
    );
    expect(events.assignCategory.mock.calls).toEqual([[5, 3]]);
    expect(events.removeCategory.mock.calls).toEqual([[5, 1]]);
  });

  it("clears FAQs that were removed", async () => {
    events.faqCount.mockResolvedValue(2);
    await eventsWriteService.update(5, { draft: draft({ faqs: [] }) }, admin);
    expect(JSON.parse(childCall("faqs")![2])).toEqual([]);
  });

  it("clears saved stages with the '[]' marker", async () => {
    events.getById.mockResolvedValue({ stages_json: '[{"label":"Day 1"}]' });
    await eventsWriteService.update(5, { draft: draft({ stages: [] }) }, admin);
    expect(events.update.mock.calls[0][1].stages_json).toBe("[]");
  });

  it("clears partners that were removed", async () => {
    events.partnerCount.mockResolvedValue(2);
    await eventsWriteService.update(
      5,
      { draft: draft({ partners: [] }) },
      admin,
    );
    expect(events.replacePartners).toHaveBeenCalledWith(5, []);
  });

  it("keeps an uploaded card image and clears one that was removed", async () => {
    events.getById.mockResolvedValue({
      stages_json: null,
      card_image_url: "/events/5/card-image-file",
    });
    await eventsWriteService.update(
      5,
      { draft: draft({ cardImageUrl: "/events/api/v1/events/5/card-image" }) },
      admin,
    );
    expect(events.setCardImageUrl).not.toHaveBeenCalled();

    await eventsWriteService.update(
      5,
      { draft: draft({ cardImageUrl: "" }) },
      admin,
    );
    expect(events.setCardImageUrl).toHaveBeenCalledWith(5, null);
  });

  it("attaches follow-up choices to the freshly recreated option ids", async () => {
    savedQuestions.value = [
      {
        ...savedQuestion,
        id: 900,
        type: "CHECKBOX",
        options: [{ id: 901, label: "Yes", sortOrder: 0 }],
      },
    ];
    const checkbox = {
      id: 7,
      prompt: "Bringing a laptop?",
      type: "CHECKBOX",
      options: [
        {
          id: 70,
          label: "Yes",
          advancedEnabled: true,
          advancedOptions: [{ id: 55, label: "Mac", advancedOptions: [] }],
        },
      ],
    };
    await eventsWriteService.update(
      5,
      {
        draft: draft({
          advancedAdditionalQuestionsEnabled: true,
          questions: [checkbox] as never,
        }),
      },
      admin,
    );
    expect(questions.setAdvancedEnabled).toHaveBeenCalledWith(5, true);
    const [config] = JSON.parse(
      questions.saveAdvancedConfiguration.mock.calls[0][1],
    );
    expect(config).toMatchObject({
      questionId: 900,
      sourceOptionId: 901,
      enabled: true,
    });
    // Questions were recreated, so the old follow-up id is dropped.
    expect(config.options[0]).toMatchObject({ id: null, label: "Mac" });
  });
});

describe("patch / cover", () => {
  it("maps settings onto columns, leaving the rest untouched", async () => {
    await eventsWriteService.patch(
      5,
      { participantRegistrationEnabled: false, ratingMode: "CASUAL" },
      admin,
    );
    const [, columns] = events.update.mock.calls[0];
    expect(columns).toMatchObject({
      participant_registration_enabled: 0,
      rating_mode: "CASUAL",
    });
    expect(columns.status_id).toBeUndefined();
    expect(columns.attendee_registration_enabled).toBeUndefined();
  });

  it("404s patch for unknown events", async () => {
    events.exists.mockResolvedValue(false);
    await expect(
      eventsWriteService.patch(5, { statusId: 7 }, admin),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("only stores real raster images up to 10 MB", async () => {
    const png = Buffer.from([0x89, 0x50]);
    await eventsWriteService.uploadCover(5, png, "image/png; charset=binary");
    expect(events.setCoverImage).toHaveBeenCalledWith(5, png, "image/png");

    for (const type of ["image/svg+xml", "text/html", null]) {
      await expect(
        eventsWriteService.uploadCover(5, png, type),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(
      eventsWriteService.uploadCover(
        5,
        Buffer.alloc(10 * 1024 * 1024 + 1),
        "image/png",
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
