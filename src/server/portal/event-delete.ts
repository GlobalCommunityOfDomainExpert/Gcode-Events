import * as db from "./ords";
import { API_BASE_URL } from "@/lib/api/client";
import { deleteRule } from "@/lib/event-delete";
import { forbidden, HttpError, notFound } from "./http";
import { isManager, getEvent } from "./access";

// Deleting an event, decided on the server. The browser only asks: who is
// calling comes from the verified token, and the draft / registration rules
// are re-checked here, so editing the page changes nothing. The database
// trigger (docs/sql/event-delete) is a second guard behind this one.

interface PublicEvent {
  status_code?: string | null;
  registered_count?: number | null;
  participant_registered_count?: number | null;
}

async function publicEvent(eventId: number): Promise<PublicEvent> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}`, {
    cache: "no-store",
  });
  if (res.status === 404) throw notFound("Event not found");
  if (!res.ok) throw new Error(`event lookup failed (${res.status})`);
  const j = (await res.json()) as { items?: PublicEvent[] };
  const ev = j.items?.[0];
  if (!ev) throw notFound("Event not found");
  return ev;
}

export async function deleteEventAs(
  eventId: number,
  userId: string,
  admin: boolean,
): Promise<void> {
  const ev = await getEvent(eventId);
  const pub = await publicEvent(eventId);
  const rows = await db.list<{ active: string }>("portal_v_participants", {
    event_id: eventId,
  });
  const registrations = Math.max(
    rows.filter((r) => r.active === "Y").length,
    (pub.registered_count ?? 0) + (pub.participant_registered_count ?? 0),
  );
  const rule = deleteRule({
    status: pub.status_code ?? "",
    registrations,
    isAdmin: admin,
  });
  if (!rule.allowed) {
    throw forbidden(
      rule.reason === "not-admin"
        ? "Only an admin can delete a published event"
        : "This event has too many registrations to delete. Cancel it instead.",
    );
  }
  // A draft can be deleted by an admin or by whoever runs the event.
  if (rule.draft && !admin && !(await isManager(ev, userId)))
    throw forbidden("Only the organizer or an admin can delete this draft");

  const out = await db.tryRemove("portal_events", eventId);
  if (!out.ok)
    throw new HttpError(
      409,
      out.error?.includes("ORA-20401")
        ? "This event has too many registrations to delete. Cancel it instead."
        : "The event could not be deleted because other records still use it",
    );
}
