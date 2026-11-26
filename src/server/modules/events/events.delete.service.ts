import "server-only";
import { DatabaseError } from "@/infrastructure/database";
import { isAdmin, type SessionUser } from "@/server/auth/session";
import { transaction, within } from "@/server/db/transaction";
import { AppError } from "@/server/http/errors";
import { deleteRule } from "@/lib/event-delete";
import { lookupsService } from "@/server/modules/lookups/lookups.service";
import { getEvent, isManager } from "@/server/modules/portal/portal.access";
import { portalRepository } from "@/server/modules/portal/portal.repository";
import { createEventsRepository } from "./events.repository";
import { eventsService } from "./events.service";

// Deleting an event, decided on the server. The browser only asks: who is
// calling comes from the session, and the draft / registration rules are
// re-checked here, so editing the page changes nothing. gcode_purge_event and
// the delete trigger (docs/sql/event-delete) are a second guard behind this.

export const eventsDeleteService = {
  async remove(eventId: number, user: SessionUser): Promise<void> {
    const ev = await getEvent(eventId);
    const detail = await eventsService.get(eventId);
    const statuses = await lookupsService.statuses();
    const status = statuses.find((s) => s.id === detail.statusId)?.code ?? "";
    const active = (await portalRepository.participants(eventId)).filter(
      (p) => p.active === "Y",
    ).length;
    const registrations = Math.max(
      active,
      (detail.registeredCount ?? 0) + (detail.participantRegisteredCount ?? 0),
    );
    const admin = isAdmin(user);
    const rule = deleteRule({ status, registrations, isAdmin: admin });
    if (!rule.allowed)
      throw AppError.forbidden("Only an admin can delete a published event");
    // A draft can be deleted by an admin or by whoever runs the event.
    if (rule.draft && !admin && !(await isManager(ev, user.userId)))
      throw AppError.forbidden(
        "Only the organizer or an admin can delete this draft",
      );

    try {
      await transaction((tx) =>
        // force tells the database guard this is a verified admin override.
        createEventsRepository(within(tx)).delete(eventId, rule.override),
      );
    } catch (err) {
      // Purge refusals (live payments, too many registrations) are
      // RAISE_APPLICATION_ERROR text and reach the user as BAD_REQUEST.
      if (DatabaseError.is(err) && err.code === "FOREIGN_KEY_VIOLATION") {
        console.error("[event-delete]", eventId, err);
        throw new AppError(
          "CONFLICT",
          "The event could not be deleted because other records still use it.",
        );
      }
      throw err;
    }
  },
};
