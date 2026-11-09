import { getEvent } from "@/lib/api/events";
import { getEventTypes, getModes, getStatuses } from "@/lib/api/lookups";
import { listParticipants } from "@/lib/api/participants";
import { adaptApiEvent, adaptParticipant } from "@/lib/api/adapters";
import { Attendee } from "@/lib/attendees";
import { Event } from "@/lib/event";

export interface DashboardData {
  event: Event;
  // Real registrations only: dummy, cancelled and inactive rows are removed.
  attendees: Attendee[];
  registrations: number;
  attendeeCount: number;
  participantCount: number;
  paidTickets: number;
  revenueInr: number;
  registeredThisWeek: number;
}

// Test registrations seeded on the event ("Dummy Attendee 01", ...). They are
// excluded from every number on the dashboard.
const isDummy = (name: string | null | undefined) =>
  /^dummy\b/i.test((name ?? "").trim());

export async function getDashboardData(
  eventId: string,
): Promise<DashboardData | null> {
  const [detail, rows, types, modes, statuses] = await Promise.all([
    getEvent(eventId),
    listParticipants(eventId),
    getEventTypes(),
    getModes(),
    getStatuses(),
  ]);
  if (!detail) return null;

  const event = adaptApiEvent(
    detail,
    Object.fromEntries(types.map((t) => [t.id, t.name])),
    Object.fromEntries(modes.map((m) => [m.id, m.mode_name])),
    Object.fromEntries(statuses.map((s) => [s.id, s.status_code])),
  );

  const prices = {
    attendee: event.attendeeRegistration.price ?? 0,
    participant: event.participantRegistration?.price ?? 0,
  };
  const attendees = rows
    .filter(
      (r) =>
        r.active === "Y" && r.status !== "CANCELLED" && !isDummy(r.user_name),
    )
    .map((r) => adaptParticipant(r, prices));

  const paid = attendees.filter((a) => a.ticketType === "Paid");
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  return {
    event,
    attendees,
    registrations: attendees.length,
    attendeeCount: attendees.filter((a) => a.category === "Attendee").length,
    participantCount: attendees.filter((a) => a.category === "Participant")
      .length,
    paidTickets: paid.length,
    revenueInr: attendees.reduce((sum, a) => sum + (a.amountPaid ?? 0), 0),
    registeredThisWeek: attendees.filter(
      (a) => new Date(a.registeredAt) >= oneWeekAgo,
    ).length,
  };
}
