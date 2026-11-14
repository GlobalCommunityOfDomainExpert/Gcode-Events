import { hasEventEnded, type Event } from "@/lib/event";

// What an organizer needs for a given event, decided from its type, mode and
// passes — so hackathons get judging, paid events
// get money tools, and nobody wades through sections that don't apply.

export interface EventTools {
  /** Rounds, scoring, shortlists — events where people compete or perform. */
  judging: boolean;
  /** Coupons + UPI claims — anything with a paid pass. */
  money: boolean;
  /** Door check-in — anything with a physical venue. */
  checkIn: boolean;
}

const COMPETITIVE = ["Hackathon", "Cultural Event"];

export function eventTools(event: Event): EventTools {
  return {
    // A participant pass alone isn't judging (e.g. a webinar's paid clinic);
    // competitive formats are, and so is anything that already has rounds.
    judging: COMPETITIVE.includes(event.type) || event.rounds.length > 0,
    money:
      (event.attendeeRegistration.enabled &&
        event.attendeeRegistration.price > 0) ||
      (event.participantRegistration.enabled &&
        event.participantRegistration.price > 0),
    checkIn: event.mode !== "Online",
  };
}

export type Bucket = "upcoming" | "draft" | "past" | "cancelled";

export function bucketOf(event: Event, now: Date): Bucket {
  if (event.status === "CANCELLED") return "cancelled";
  if (event.status === "DRAFT") return "draft";
  if (hasEventEnded(event, now)) return "past";
  return "upcoming";
}

export const startMs = (event: Event) =>
  event.startDateIso ? new Date(event.startDateIso).getTime() : 0;

/** "in 13 days" · "tomorrow" · "today" · "ended 4 days ago" */
export function relativeWhen(event: Event, now: Date): string {
  const start = startMs(event);
  if (!start) return "Date to be set";
  const days = Math.round((start - now.getTime()) / 86_400_000);
  if (hasEventEnded(event, now)) {
    const ago = Math.max(1, -days);
    return ago === 1 ? "ended yesterday" : `ended ${ago} days ago`;
  }
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export interface Attention {
  label: string;
  tone: "warning" | "danger" | "info";
  /** dashboard sub-path to fix it ("" = overview) */
  path: string;
}

/** The one or two things on an event that want the organizer's attention. */
export function attentionFor(
  event: Event,
  now: Date,
  /** List rows don't load rounds, so they can't tell if judging is set up. */
  { roundsKnown = true }: { roundsKnown?: boolean } = {},
): Attention[] {
  const out: Attention[] = [];
  const bucket = bucketOf(event, now);
  if (bucket === "draft")
    return [{ label: "Finish setup", tone: "warning", path: "/edit" }];
  if (bucket !== "upcoming") return out;

  const tools = eventTools(event);
  const start = startMs(event);
  const daysToStart = start ? (start - now.getTime()) / 86_400_000 : Infinity;
  const cap = totalCapacity(event);
  const regs = totalRegistered(event);
  if (cap && regs / cap >= 0.9)
    out.push({
      label: regs >= cap ? "Sold out" : "Almost full",
      tone: "info",
      path: "",
    });
  if (daysToStart <= 2)
    out.push({ label: "Starts soon", tone: "danger", path: "" });
  if (roundsKnown && tools.judging && event.rounds.length === 0)
    out.push({ label: "Set up judging", tone: "warning", path: "/rounds" });
  if (!event.coverImageUrl)
    out.push({ label: "No cover image", tone: "warning", path: "/edit" });
  return out.slice(0, 2);
}

/** Registrations across both passes — the one number shown everywhere. */
export const totalRegistered = (event: Event) =>
  event.registeredCount +
  (event.participantRegistration.enabled
    ? event.participantRegistration.registeredCount
    : 0);

/** Combined capacity, or undefined when either open pass is uncapped. */
export const totalCapacity = (event: Event) => {
  const p = event.participantRegistration;
  if (!event.capacity || (p.enabled && !p.capacity)) return undefined;
  return event.capacity + (p.enabled ? (p.capacity ?? 0) : 0);
};

export const revenueOf = (event: Event) =>
  event.registeredCount * (event.attendeeRegistration.price || 0) +
  (event.participantRegistration.registeredCount || 0) *
    (event.participantRegistration.price || 0);

export const inr = (n: number) =>
  n === 0 ? "—" : `₹${n.toLocaleString("en-IN")}`;
