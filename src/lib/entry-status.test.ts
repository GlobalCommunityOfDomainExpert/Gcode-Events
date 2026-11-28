import { describe, expect, it } from "vitest";
import { computeEntryTodo, timeLeft } from "./entry-status";
import type { MyTicket } from "@/lib/event";

const ticket = {
  participantId: "9",
  eventId: "5",
  title: "Open Mic",
} as MyTicket;

const NOW = new Date("2026-11-20T00:00:00Z");
// Registration closes 2026-11-20T12:00Z → entry window closes +24h.
const open = {
  registrationDeadline: "2026-11-20T12:00:00Z",
  participantRegistrationDeadline: "2026-11-21T12:00:00Z",
};
const base = {
  ticket,
  detail: {
    ...open,
    audioRecordingEnabled: false,
    audioRecordingAppliesTo: "PARTICIPANT" as const,
  },
  questions: [] as {
    id: number;
    appliesTo: "ATTENDEE" | "PARTICIPANT";
    required: boolean;
  }[],
  participant: {
    category: "ATTENDEE" as const,
    audioSubmissionUrl: null as string | null,
    appliedOn: "2026-11-01T00:00:00Z",
  },
  answers: [] as {
    questionId: number;
    optionId: number | null;
    answerText: string | null;
  }[],
};
const q = (
  id: number,
  required = true,
  appliesTo: "ATTENDEE" | "PARTICIPANT" = "ATTENDEE",
) => ({
  id,
  appliesTo,
  required,
});

describe("computeEntryTodo", () => {
  it("is null when nothing is asked", () => {
    expect(computeEntryTodo(base, NOW)).toBeNull();
  });
  it("is null when all required questions are answered", () => {
    const r = computeEntryTodo(
      {
        ...base,
        questions: [q(1), q(2, false)],
        answers: [{ questionId: 1, optionId: null, answerText: "x" }],
      },
      NOW,
    );
    expect(r).toBeNull();
  });
  it("counts missing required questions, ignoring other passes and optional ones", () => {
    const r = computeEntryTodo(
      {
        ...base,
        questions: [q(1), q(2), q(3, false), q(4, true, "PARTICIPANT")],
      },
      NOW,
    );
    expect(r).toMatchObject({ required: 2, answered: 0, needsClip: false });
    expect(r?.href).toBe("/5/additional-info?pid=9");
  });
  it("treats a blank text answer as unanswered, an option answer as answered", () => {
    const r = computeEntryTodo(
      {
        ...base,
        questions: [q(1), q(2)],
        answers: [
          { questionId: 1, optionId: null, answerText: "  " },
          { questionId: 2, optionId: 7, answerText: null },
        ],
      },
      NOW,
    );
    expect(r).toMatchObject({ required: 2, answered: 1 });
  });
  it("flags a missing clip only for the pass it applies to", () => {
    const withAudio = {
      ...base,
      detail: {
        ...open,
        audioRecordingEnabled: true,
        audioRecordingAppliesTo: "ATTENDEE" as const,
      },
    };
    expect(computeEntryTodo(withAudio, NOW)?.needsClip).toBe(true);
    expect(
      computeEntryTodo(
        {
          ...withAudio,
          participant: {
            ...base.participant,
            audioSubmissionUrl: "https://x",
          },
        },
        NOW,
      ),
    ).toBeNull();
    expect(
      computeEntryTodo(
        {
          ...withAudio,
          detail: {
            ...withAudio.detail,
            audioRecordingAppliesTo: "PARTICIPANT" as const,
          },
        },
        NOW,
      ),
    ).toBeNull();
  });
  it("is null once the 24h window has closed", () => {
    const late = new Date("2026-11-21T12:00:01Z");
    expect(computeEntryTodo({ ...base, questions: [q(1)] }, late)).toBeNull();
  });
  it("uses the participant pass's own deadline", () => {
    const r = computeEntryTodo(
      {
        ...base,
        questions: [q(1, true, "PARTICIPANT")],
        participant: { ...base.participant, category: "PARTICIPANT" },
      },
      NOW,
    );
    expect(r?.deadline.toISOString()).toBe("2026-11-22T12:00:00.000Z");
  });
  it("soonest deadline can be sorted first", () => {
    const a = computeEntryTodo({ ...base, questions: [q(1)] }, NOW)!;
    const b = computeEntryTodo(
      {
        ...base,
        questions: [q(1, true, "PARTICIPANT")],
        participant: { ...base.participant, category: "PARTICIPANT" },
      },
      NOW,
    )!;
    expect(
      [b, a].sort((x, y) => x.deadline.getTime() - y.deadline.getTime())[0],
    ).toBe(a);
  });
});

describe("timeLeft", () => {
  it("formats days and hours past 48h, hours and minutes below", () => {
    expect(
      timeLeft(
        new Date("2026-11-22T04:00:00Z"),
        new Date("2026-11-20T00:00:00Z"),
      ),
    ).toBe("2d 4h");
    expect(
      timeLeft(
        new Date("2026-11-20T05:12:00Z"),
        new Date("2026-11-20T00:00:00Z"),
      ),
    ).toBe("5h 12m");
    expect(
      timeLeft(
        new Date("2026-11-19T00:00:00Z"),
        new Date("2026-11-20T00:00:00Z"),
      ),
    ).toBe("0h 0m");
  });
});
