import { Event, EventTimelineItem } from "@/lib/event";

// "14:30" / "00:00" -> "2:30 PM" / "12:00 AM". Handles the 12/0 hour edge.
export function to12Hour(hhmm: string): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// Bucket timeline items by calendar date so multi-day agendas get a header per
// day. Single-day agendas produce one group with no label.
export function groupByDay(items: EventTimelineItem[]) {
  const order: string[] = [];
  const buckets = new Map<string, EventTimelineItem[]>();
  for (const item of items) {
    const key = item.date || "";
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(item);
  }
  const multiDay = order.filter((d) => d).length > 1;
  return order.map((day) => {
    const items = buckets.get(day)!;
    // Organizer's own day name, from whichever item on that day carries it.
    const title = day
      ? (items.find((i) => i.dayLabel?.trim())?.dayLabel?.trim() ?? "")
      : "";
    const date =
      multiDay && day
        ? new Intl.DateTimeFormat("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          }).format(new Date(day))
        : "";
    return {
      day,
      title,
      label: title && date ? `${title} · ${date}` : date,
      items,
    };
  });
}

// Whole days between now and an ISO deadline. Null if no deadline is set.
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  return Math.ceil(diffMs / 86_400_000);
}

// event.time (if set) -> earliest agenda item's time (more descriptive) ->
// the organizer's free-text duration -> blank.
export function resolveDisplayTime(event: Event): string {
  if (event.time) return event.time;
  const firstTimedItem = event.timeline.find((item) => item.time);
  if (firstTimedItem) return firstTimedItem.time;
  return event.durationText ?? "";
}
