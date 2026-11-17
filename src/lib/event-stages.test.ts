import { describe, expect, it } from "vitest";
import { stageCountdown, stageDates, stageStatus } from "./event-stages";

// IST calendar days; 06:00Z is 11:30 IST the same day.
const at = (iso: string) => new Date(`${iso}T06:00:00Z`);

describe("multi-date stages", () => {
  const range = { date: "2026-11-25", endDate: "2026-11-27" };

  it("labels a range", () => {
    expect(stageDates(range)).toBe("25 – 27 Nov");
    expect(stageDates({ date: "2026-12-28", endDate: "2027-01-03" })).toBe(
      "28 Dec – 3 Jan",
    );
  });

  it("treats an end on or before the start as one day", () => {
    expect(stageDates({ date: "2026-11-25", endDate: "2026-11-25" })).toBe(
      "Wed, 25 Nov",
    );
    expect(stageDates({ date: "2026-11-25", endDate: "2026-11-20" })).toBe(
      "Wed, 25 Nov",
    );
    expect(stageDates({ date: "2026-11-25" })).toBe("Wed, 25 Nov");
  });

  it("runs In N days → On now · ends → Last day → done", () => {
    expect(stageCountdown(range, at("2026-11-17"))).toBe("In 8 days");
    expect(stageCountdown(range, at("2026-11-24"))).toBe("Tomorrow");
    expect(stageCountdown(range, at("2026-11-25"))).toBe(
      "On now · ends 27 Nov",
    );
    expect(stageCountdown(range, at("2026-11-26"))).toBe(
      "On now · ends 27 Nov",
    );
    expect(stageCountdown(range, at("2026-11-27"))).toBe("Last day");
    expect(stageCountdown(range, at("2026-11-28"))).toBeNull();
    expect(stageStatus(range, at("2026-11-28"))).toBe("done");
  });

  it("keeps single-day behaviour", () => {
    const one = { date: "2026-11-25" };
    expect(stageCountdown(one, at("2026-11-25"))).toBe("Today");
    expect(stageCountdown(one, at("2026-11-26"))).toBeNull();
    expect(stageCountdown({ date: "" }, at("2026-11-25"))).toBe("Date TBA");
  });
});
