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

export function stageStatus(
  stage: Pick<EventStage, "date">,
  now: Date,
): StageStatus {
  if (!stage.date) return "tba";
  const today = istDay(now);
  if (stage.date < today) return "done";
  return stage.date === today ? "today" : "upcoming";
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

/** "Fri, 27 Nov · 10:00 AM", "Fri, 27 Nov", or "Date TBA". */
export function stageWhen(stage: Pick<EventStage, "date" | "time">): string {
  if (!stage.date) return "Date TBA";
  const [y, m, d] = stage.date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  if (!stage.time) return day;
  const [hh, mm] = stage.time.split(":").map(Number);
  const time = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
  return `${day} · ${time}`;
}

/** "Today", "Tomorrow", "In 16 days", "Date TBA" — null once it's over. */
export function stageCountdown(
  stage: Pick<EventStage, "date">,
  now: Date,
): string | null {
  const status = stageStatus(stage, now);
  if (status === "done") return null;
  if (status === "tba") return "Date TBA";
  if (status === "today") return "Today";
  const days = Math.round(
    (Date.parse(stage.date) - Date.parse(istDay(now))) / 86_400_000,
  );
  return days === 1 ? "Tomorrow" : `In ${days} days`;
}
