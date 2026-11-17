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
  registration_deadline: "2026-11-20T12:00:00Z",
  participant_registration_deadline: "2026-11-21T12:00:00Z",
};
const base = {
  ticket,
  detail: { ...open, audio_recording_enabled: 0 },
  questions: [] as {
    id: number;
    applies_to: "ATTENDEE" | "PARTICIPANT";
    is_required: number;
  }[],
  participant: {
    category: "ATTENDEE" as const,
    audio_submission_url: null as string | null,
    applied_on: "2026-11-01T00:00:00Z",
  },
  answers: [] as {
    question_id: number;
    option_id: number | null;
    answer_text: string | null;
  }[],
};
const q = (
  id: number,
  required = 1,
  applies_to: "ATTENDEE" | "PARTICIPANT" = "ATTENDEE",
) => ({
  id,
  applies_to,
  is_required: required,
});

describe("computeEntryTodo", () => {
  it("is null when nothing is asked", () => {
    expect(computeEntryTodo(base, NOW)).toBeNull();
  });
  it("is null when all required questions are answered", () => {
    const r = computeEntryTodo(
      {
        ...base,
        questions: [q(1), q(2, 0)],
        answers: [{ question_id: 1, option_id: null, answer_text: "x" }],
      },
      NOW,
    );
    expect(r).toBeNull();
  });
  it("counts missing required questions, ignoring other passes and optional ones", () => {
    const r = computeEntryTodo(
      { ...base, questions: [q(1), q(2), q(3, 0), q(4, 1, "PARTICIPANT")] },
      NOW,
    );
    expect(r).toMatchObject({ required: 2, answered: 0, needsClip: false });
    expect(r?.href).toBe("/events/5/additional-info?pid=9");
  });
  it("treats a blank text answer as unanswered, an option answer as answered", () => {
    const r = computeEntryTodo(
      {
        ...base,
        questions: [q(1), q(2)],
        answers: [
          { question_id: 1, option_id: null, answer_text: "  " },
          { question_id: 2, option_id: 7, answer_text: null },
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
        audio_recording_enabled: 1,
        audio_recording_applies_to: "ATTENDEE" as const,
      },
    };
    expect(computeEntryTodo(withAudio, NOW)?.needsClip).toBe(true);
    expect(
      computeEntryTodo(
        {
          ...withAudio,
          participant: {
            ...base.participant,
            audio_submission_url: "https://x",
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
            audio_recording_applies_to: "PARTICIPANT" as const,
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
        questions: [q(1, 1, "PARTICIPANT")],
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
        questions: [q(1, 1, "PARTICIPANT")],
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
