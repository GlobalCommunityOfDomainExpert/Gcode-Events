// Database codes (MODE_OF_EVENTS.MODE_NAME, EVENT_STATUS.STATUS_CODE, …)
// mapped to the labels the UI uses.

import { EventType, EventStatus, Event, EventRound } from "@/lib/event";

const MODE_NAME_MAP: Record<string, Event["mode"]> = {
  PHYSICAL: "In-Person",
  ONLINE: "Online",
  HYBRID: "Hybrid",
};

const KNOWN_EVENT_STATUSES: EventStatus[] = [
  "DRAFT",
  "APPROVAL_PENDING",
  "OPEN",
  "REGISTRATION_CLOSED",
  "ONGOING",
  "COMPLETED",
  "CANCELLED",
];

export function resolveEventType(name: string | undefined): EventType {
  return name ?? "Other";
}

export function resolveMode(name: string | undefined): Event["mode"] {
  return (name && MODE_NAME_MAP[name]) || "Online";
}

export function resolveStatus(
  code: string | undefined,
): EventStatus | undefined {
  return KNOWN_EVENT_STATUSES.find((s) => s === code);
}

export function resolveRatingMode(
  mode: "COMPETITIVE" | "CASUAL" | undefined,
): Event["ratingMode"] {
  return mode === "CASUAL" ? "Casual" : "Competitive";
}

export function resolveRoundMode(
  mode: "ONLINE" | "OFFLINE" | undefined,
): EventRound["mode"] {
  return mode === "ONLINE" ? "Online" : "Offline";
}
