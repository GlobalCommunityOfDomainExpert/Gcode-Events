import * as db from "./ords";
import { AppError } from "@/server/http/errors";
import { eventsService } from "@/server/modules/events/events.service";
import { lookupsService } from "@/server/modules/lookups/lookups.service";
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
  let detail;
  try {
    detail = await eventsService.get(eventId);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND")
      throw notFound("Event not found");
    throw e;
  }
  const statuses = await lookupsService.statuses();
  return {
    status_code: statuses.find((s) => s.id === detail.statusId)?.code ?? null,
    registered_count: detail.registeredCount,
    participant_registered_count: detail.participantRegisteredCount,
  };
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
  if (!rule.allowed)
    throw forbidden("Only an admin can delete a published event");
  // A draft can be deleted by an admin or by whoever runs the event.
  if (rule.draft && !admin && !(await isManager(ev, userId)))
    throw forbidden("Only the organizer or an admin can delete this draft");

  // force=Y tells the database guard this is a verified admin override.
  const out = await db.tryRemove(
    "portal_events",
    eventId,
    rule.override ? "?force=Y" : "",
  );
  if (!out.ok) {
    console.error("[event-delete]", eventId, out.error);
    throw new HttpError(
      409,
      out.error?.includes("ORA-20402")
        ? "This event has live payments. Cancel and refund it instead of deleting."
        : out.error?.includes("ORA-20401")
          ? "This event has too many registrations to delete."
          : out.error?.includes("ORA-02292")
            ? `The event could not be deleted because other records still use it (${out.error.match(/\(([^)]+)\)/)?.[1] ?? "see server log"}).`
            : "The event could not be deleted.",
    );
  }
}
