import type { EventStage } from "@/lib/event";

export const STAGE_MODE_LABEL: Record<EventStage["mode"], string> = {
  Online: "Online",
  "In-Person": "In person",
  Both: "Online + in person",
};

export type StageStatus = "done" | "today" | "upcoming" | "tba";

// Calendar day in IST (events are IST), as yyyy-mm-dd — comparable as text.
function istDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Last date of a stage — its end date when it spans several, else its date. */
export const stageLastDay = (stage: Pick<EventStage, "date" | "endDate">) =>
  stage.endDate && stage.endDate > stage.date ? stage.endDate : stage.date;

/** "today" also covers every date inside a multi-date stage. */
export function stageStatus(
  stage: Pick<EventStage, "date" | "endDate">,
  now: Date,
): StageStatus {
  if (!stage.date) return "tba";
  const today = istDay(now);
  if (stageLastDay(stage) < today) return "done";
  return stage.date <= today ? "today" : "upcoming";
}

const fmtDay = (iso: string, o: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    ...o,
    timeZone: "UTC",
  });
};

/**
 * "Sat, 9 Jan" or, across several dates, "9 – 16 Jan" / "28 Dec – 3 Jan".
 * `long` spells the weekday out for a single day ("Saturday, 9 Jan").
 */
export function stageDates(
  stage: Pick<EventStage, "date" | "endDate">,
  long = false,
): string {
  if (!stage.date) return "Date TBA";
  const last = stageLastDay(stage);
  if (last === stage.date)
    return fmtDay(stage.date, {
      weekday: long ? "long" : "short",
      day: "numeric",
      month: "short",
    });
  const sameMonth = stage.date.slice(0, 7) === last.slice(0, 7);
  const from = fmtDay(
    stage.date,
    sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" },
  );
  return `${from} – ${fmtDay(last, { day: "numeric", month: "short" })}`;
}

/**
 * The stage a visitor most likely cares about: the first one that hasn't
 * passed (today's, else the next — including date-TBA ones, in the
 * organizer's order). Once everything is over, the last stage.
 */
export function pickStage(stages: EventStage[], now: Date): number {
  const i = stages.findIndex((s) => stageStatus(s, now) !== "done");
  return i === -1 ? stages.length - 1 : i;
}

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  done: "Completed",
  today: "Happening today",
  upcoming: "Up next",
  tba: "Date to be announced",
};

/** "Fri, 27 Nov · 10:00 AM", "9 – 16 Jan · 6:00 PM", or "Date TBA". */
export function stageWhen(
  stage: Pick<EventStage, "date" | "endDate" | "time">,
): string {
  if (!stage.date) return "Date TBA";
  const day = stageDates(stage);
  if (!stage.time) return day;
  const [hh, mm] = stage.time.split(":").map(Number);
  const time = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
  return `${day} · ${time}`;
}

/**
 * "Today", "Tomorrow", "In 16 days", "Date TBA" — null once it's over. A
 * multi-date stage in progress says "On now · ends 16 Jan".
 */
export function stageCountdown(
  stage: Pick<EventStage, "date" | "endDate">,
  now: Date,
): string | null {
  const status = stageStatus(stage, now);
  if (status === "done") return null;
  if (status === "tba") return "Date TBA";
  if (status === "today") {
    const last = stageLastDay(stage);
    if (last === istDay(now)) return last === stage.date ? "Today" : "Last day";
    return `On now · ends ${fmtDay(last, { day: "numeric", month: "short" })}`;
  }
  const days = Math.round(
    (Date.parse(stage.date) - Date.parse(istDay(now))) / 86_400_000,
  );
  return days === 1 ? "Tomorrow" : `In ${days} days`;
}
