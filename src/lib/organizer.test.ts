import { describe, expect, it } from "vitest";
import type { Event, RegistrationCategory } from "./event";
import {
  attentionFor,
  bucketOf,
  eventTools,
  inr,
  relativeWhen,
  revenueOf,
  totalCapacity,
  totalRegistered,
} from "./organizer";

const NOW = new Date("2026-11-13T10:00:00.000Z");
const DAY = 86_400_000;
const iso = (offsetDays: number) =>
  new Date(NOW.getTime() + offsetDays * DAY).toISOString();

function pass(over: Partial<RegistrationCategory> = {}): RegistrationCategory {
  return {
    enabled: true,
    label: "Attendee",
    description: "",
    price: 0,
    priceLabel: "Free",
    registeredCount: 0,
    registrationCloses: "",
    ...over,
  };
}

function makeEvent(over: Partial<Event> = {}): Event {
  return {
    id: "1",
    title: "Test event",
    type: "Workshop",
    mode: "In-Person",
    status: "PUBLISHED",
    registeredCount: 0,
    capacity: undefined,
    startDateIso: iso(10),
    endDateIso: iso(11),
    coverImageUrl: "https://example.com/cover.png",
    rounds: [],
    attendeeRegistration: pass(),
    participantRegistration: pass({ enabled: false, label: "Participant" }),
    ...over,
  } as Event;
}

describe("eventTools", () => {
  it("gives judging to competitive types and to events that already have rounds", () => {
    expect(eventTools(makeEvent({ type: "Hackathon" })).judging).toBe(true);
    expect(eventTools(makeEvent({ type: "Cultural Event" })).judging).toBe(
      true,
    );
    expect(eventTools(makeEvent({ type: "Workshop" })).judging).toBe(false);
    expect(
      eventTools(
        makeEvent({ type: "Workshop", rounds: [{}] as Event["rounds"] }),
      ).judging,
    ).toBe(true);
  });

  it("shows money tools only when an enabled pass has a price", () => {
    expect(eventTools(makeEvent()).money).toBe(false);
    expect(
      eventTools(makeEvent({ attendeeRegistration: pass({ price: 500 }) }))
        .money,
    ).toBe(true);
    // A priced pass that is switched off is not a paid event.
    expect(
      eventTools(
        makeEvent({
          attendeeRegistration: pass({ price: 500, enabled: false }),
        }),
      ).money,
    ).toBe(false);
    expect(
      eventTools(
        makeEvent({
          participantRegistration: pass({ price: 99, label: "Participant" }),
        }),
      ).money,
    ).toBe(true);
  });

  it("needs check-in unless the event is online", () => {
    expect(eventTools(makeEvent({ mode: "Online" })).checkIn).toBe(false);
    expect(eventTools(makeEvent({ mode: "In-Person" })).checkIn).toBe(true);
    expect(eventTools(makeEvent({ mode: "Hybrid" })).checkIn).toBe(true);
  });
});

describe("bucketOf", () => {
  it("puts cancelled first, then draft, then past, else upcoming", () => {
    expect(bucketOf(makeEvent({ status: "CANCELLED" }), NOW)).toBe("cancelled");
    expect(
      bucketOf(makeEvent({ status: "CANCELLED", endDateIso: iso(-5) }), NOW),
    ).toBe("cancelled");
    expect(
      bucketOf(makeEvent({ status: "DRAFT", endDateIso: iso(-5) }), NOW),
    ).toBe("draft");
    expect(bucketOf(makeEvent({ endDateIso: iso(-1) }), NOW)).toBe("past");
    expect(bucketOf(makeEvent(), NOW)).toBe("upcoming");
  });
});

describe("relativeWhen", () => {
  it("describes upcoming, same-day and ended events", () => {
    expect(relativeWhen(makeEvent({ startDateIso: iso(13) }), NOW)).toBe(
      "in 13 days",
    );
    expect(relativeWhen(makeEvent({ startDateIso: iso(1) }), NOW)).toBe(
      "tomorrow",
    );
    expect(relativeWhen(makeEvent({ startDateIso: iso(0) }), NOW)).toBe(
      "today",
    );
    expect(
      relativeWhen(
        makeEvent({ startDateIso: iso(-4), endDateIso: iso(-4) }),
        NOW,
      ),
    ).toBe("ended 4 days ago");
    expect(
      relativeWhen(
        makeEvent({ startDateIso: iso(-1), endDateIso: iso(-1) }),
        NOW,
      ),
    ).toBe("ended yesterday");
    expect(relativeWhen(makeEvent({ startDateIso: null }), NOW)).toBe(
      "Date to be set",
    );
  });
});

describe("totals", () => {
  it("counts registrations across both passes only when participant is open", () => {
    const closed = makeEvent({
      registeredCount: 10,
      participantRegistration: pass({
        enabled: false,
        registeredCount: 4,
      }),
    });
    expect(totalRegistered(closed)).toBe(10);
    const open = makeEvent({
      registeredCount: 10,
      participantRegistration: pass({ registeredCount: 4 }),
    });
    expect(totalRegistered(open)).toBe(14);
  });

  it("combines capacities and returns undefined when an open pass is uncapped", () => {
    expect(totalCapacity(makeEvent())).toBeUndefined();
    expect(totalCapacity(makeEvent({ capacity: 100 }))).toBe(100);
    expect(
      totalCapacity(
        makeEvent({
          capacity: 100,
          participantRegistration: pass({ capacity: 20 }),
        }),
      ),
    ).toBe(120);
    expect(
      totalCapacity(
        makeEvent({
          capacity: 100,
          participantRegistration: pass({ capacity: undefined }),
        }),
      ),
    ).toBeUndefined();
  });

  it("estimates revenue from price times registrations and formats rupees", () => {
    const e = makeEvent({
      registeredCount: 3,
      attendeeRegistration: pass({ price: 500 }),
      participantRegistration: pass({ price: 100, registeredCount: 2 }),
    });
    expect(revenueOf(e)).toBe(1700);
    expect(inr(0)).toBe("—");
    expect(inr(1700)).toBe("₹1,700");
  });
});

describe("attentionFor", () => {
  it("asks drafts to finish setup, and nothing for past or cancelled events", () => {
    expect(attentionFor(makeEvent({ status: "DRAFT" }), NOW)).toEqual([
      { label: "Finish setup", tone: "warning", path: "/edit" },
    ]);
    expect(attentionFor(makeEvent({ endDateIso: iso(-3) }), NOW)).toEqual([]);
    expect(attentionFor(makeEvent({ status: "CANCELLED" }), NOW)).toEqual([]);
  });

  it("flags near-full, starting soon, missing judging and missing cover (max two)", () => {
    const almostFull = makeEvent({ capacity: 100, registeredCount: 90 });
    expect(attentionFor(almostFull, NOW).map((a) => a.label)).toEqual([
      "Almost full",
    ]);
    const soldOut = makeEvent({ capacity: 100, registeredCount: 100 });
    expect(attentionFor(soldOut, NOW)[0].label).toBe("Sold out");

    const crowded = makeEvent({
      type: "Hackathon",
      startDateIso: iso(1),
      capacity: 10,
      registeredCount: 10,
      coverImageUrl: undefined,
    });
    expect(attentionFor(crowded, NOW).map((a) => a.label)).toEqual([
      "Sold out",
      "Starts soon",
    ]);
  });

  it("only mentions judging when rounds are known", () => {
    const hack = makeEvent({ type: "Hackathon" });
    expect(attentionFor(hack, NOW).map((a) => a.label)).toContain(
      "Set up judging",
    );
    expect(
      attentionFor(hack, NOW, { roundsKnown: false }).map((a) => a.label),
    ).not.toContain("Set up judging");
  });
});
