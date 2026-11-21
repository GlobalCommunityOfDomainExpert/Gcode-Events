// Registrations: organizer attendee list and the signed-in user's tickets.

import { MyTicket } from "@/lib/event";
import type {
  MyParticipation,
  Participant,
} from "@/server/modules/participants/participants.schemas";
import { Attendee, AttendeeRole } from "@/lib/attendees";
import { resolveEventType, resolveMode, resolveStatus } from "./codes";
import {
  formatDate,
  formatTime,
  resolveImageUrl,
  resolveLocation,
} from "./format";

const ROLE_NAME_MAP: Record<string, AttendeeRole> = {
  FRESHER: "Fresher",
  STARTUP: "Startup Founder",
  EXPERT: "Domain Expert",
  INSTITUTION: "Institution",
};

// "Jane Doe" -> "JD". Guest registrants only ever give a full name, no
// avatar image, so initials are all we can show.
function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

// Organizer attendee row -> UI Attendee. Status collapses to "registered"
// for now — the participants table has no attended/no-show tracking yet.
// ticketType/amountPaid are priced off whichever category this row
// registered under.
export function adaptParticipant(
  row: Participant,
  prices: { attendee: number; participant: number },
): Attendee {
  const isParticipant = row.category === "PARTICIPANT";
  const price = isParticipant ? prices.participant : prices.attendee;
  return {
    id: String(row.id),
    eventId: String(row.eventId),
    name: row.fullName ?? "",
    email: row.email ?? "",
    phone: row.phone,
    avatarInitials: initialsOf(row.fullName ?? ""),
    role: (row.roleName && ROLE_NAME_MAP[row.roleName]) || "Guest",
    ticketType: price > 0 ? "Paid" : "Free",
    quantity: row.quantity,
    amountPaid: price > 0 ? price * row.quantity : undefined,
    status: "registered",
    registeredAt: row.appliedOn ?? "",
    category: isParticipant ? "Participant" : "Attendee",
    audioSubmissionUrl: row.audioSubmissionUrl,
    audioSubmittedOn: row.audioSubmittedOn,
  };
}

// Maps the signed-in user's own registration (GET /api/v1/me/participations)
// onto the UI's MyTicket shape.
export function adaptMyParticipation(
  row: MyParticipation,
  eventTypeNames: Record<number, string>,
  modeNames: Record<number, string>,
  statusCodes: Record<number, string>,
): MyTicket {
  const isParticipant = row.category === "PARTICIPANT";
  const price = isParticipant ? (row.participantPrice ?? 0) : row.ticketPrice;
  return {
    participantId: String(row.participantId),
    eventId: String(row.eventId),
    title: row.eventName,
    type: resolveEventType(eventTypeNames[row.eventTypeId]),
    mode: resolveMode(modeNames[row.modeOfEventId]),
    status: resolveStatus(statusCodes[row.statusId]),
    date: formatDate(row.startDate),
    time: formatTime(row.startDate),
    location: resolveLocation(row.city ?? "", row.address),
    coverImageUrl: resolveImageUrl(row.coverImageUrl),
    price: price === 0 ? "Free" : `₹${price}`,
    quantity: row.quantity,
    amountPaid: price > 0 ? price * row.quantity : undefined,
    appliedOn: row.appliedOn,
    category: isParticipant ? "Participant" : "Attendee",
  };
}
