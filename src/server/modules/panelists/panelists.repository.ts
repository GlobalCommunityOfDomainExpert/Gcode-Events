import "server-only";
import type { Row } from "@/infrastructure/database";
import { standalone, type DbSource } from "@/server/db/transaction";

// Panelists through GCODE_PANELISTS_API (Phase 1). Its writes COMMIT
// internally; the lookups are functions returning cursors.

export type PanelistRow = {
  id: number;
  event_id: number;
  user_id: string | null; // TO_CHAR'd by the package
  invited_email: string;
  status: string;
  invited_by: string | null;
  invited_on: Date;
  responded_on: Date | null;
};

export type PanelistInviteRow = {
  id: number;
  event_id: number;
  event_title: string;
  invited_email: string;
  status: string;
  invited_on: Date;
};

export function createPanelistsRepository(source: DbSource = standalone) {
  return {
    async listByEvent(eventId: number): Promise<PanelistRow[]> {
      const db = await source();
      const { rows } = await db.call<{ rows: Row[] }>(
        "BEGIN :rows := gcode_panelists_api.list_panelists(:eventId); END;",
        { eventId, rows: { out: "cursor" } },
      );
      return rows as PanelistRow[];
    },

    async getInvite(id: number): Promise<PanelistInviteRow | null> {
      const db = await source();
      const { rows } = await db.call<{ rows: Row[] }>(
        "BEGIN :rows := gcode_panelists_api.get_panelist(:id); END;",
        { id, rows: { out: "cursor" } },
      );
      return (rows[0] as PanelistInviteRow | undefined) ?? null;
    },

    // Emails the invite (best effort — the row is kept if mail fails).
    async invite(
      eventId: number,
      email: string,
      invitedBy: string,
    ): Promise<number> {
      const db = await source();
      const out = await db.call<{ id: number }>(
        `BEGIN gcode_panelists_api.invite_panelist(
           p_event_id => :eventId, p_email => :email,
           p_invited_by => :invitedBy, p_id => :id); END;`,
        { eventId, email, invitedBy, id: { out: "number" } },
      );
      return out.id;
    },

    async respond(id: number, userId: string, status: string): Promise<void> {
      const db = await source();
      await db.call(
        `BEGIN gcode_panelists_api.respond_to_invite(
           p_panelist_id => :id, p_user_id => TO_NUMBER(:userId),
           p_status => :status); END;`,
        { id, userId, status },
      );
    },

    async remove(id: number): Promise<void> {
      const db = await source();
      await db.call("BEGIN gcode_panelists_api.remove_panelist(:id); END;", {
        id,
      });
    },
  };
}

export const panelistsRepository = createPanelistsRepository();
