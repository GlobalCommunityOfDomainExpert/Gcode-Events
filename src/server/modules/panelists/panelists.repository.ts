import "server-only";
import type { Queryable, Row } from "@/infrastructure/database";
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
  panelist_role?: string | null;
  invite_note?: string | null;
};

export type PanelistInviteRow = {
  id: number;
  event_id: number;
  event_title: string;
  invited_email: string;
  status: string;
  invited_on: Date;
  panelist_role?: string | null;
  invite_note?: string | null;
};

// The role and note columns come from docs/sql/organizer-portal/01_tables.sql
// and are not part of GCODE_PANELISTS_API. Everything here is best effort: a
// database without the columns behaves as before (every invite is a judge's).
let panelistTable: Promise<string | null> | undefined;

async function tableOf(db: Queryable): Promise<string | null> {
  panelistTable ??= db
    .queryOne<{ table_name: string }>(
      `SELECT table_name FROM user_tab_columns
        WHERE column_name = 'PANELIST_ROLE'
          AND table_name IN ('GCODE_EVENT_PANELISTS','EVENT_PANELISTS','GCODE_PANELISTS')
        FETCH FIRST 1 ROWS ONLY`,
    )
    .then((r) => r?.table_name ?? null)
    .catch(() => null);
  return panelistTable;
}

type Extra = {
  id: number;
  panelist_role: string | null;
  invite_note: string | null;
};

async function extrasWhere(
  db: Queryable,
  where: string,
  binds: Record<string, number>,
): Promise<Map<number, Extra>> {
  const table = await tableOf(db);
  if (!table) return new Map();
  try {
    const { rows } = await db.query<Extra>(
      `SELECT id, panelist_role, invite_note FROM ${table} WHERE ${where}`,
      binds,
    );
    return new Map(rows.map((r) => [Number(r.id), r]));
  } catch {
    return new Map();
  }
}

export function createPanelistsRepository(source: DbSource = standalone) {
  return {
    async listByEvent(eventId: number): Promise<PanelistRow[]> {
      const db = await source();
      const { rows } = await db.call<{ rows: Row[] }>(
        "BEGIN :rows := gcode_panelists_api.list_panelists(:eventId); END;",
        { eventId, rows: { out: "cursor" } },
      );
      const extras = await extrasWhere(db, "event_id = :eventId", { eventId });
      return (rows as PanelistRow[]).map((r) => ({
        ...r,
        panelist_role: extras.get(r.id)?.panelist_role ?? null,
        invite_note: extras.get(r.id)?.invite_note ?? null,
      }));
    },

    async getInvite(id: number): Promise<PanelistInviteRow | null> {
      const db = await source();
      const { rows } = await db.call<{ rows: Row[] }>(
        "BEGIN :rows := gcode_panelists_api.get_panelist(:id); END;",
        { id, rows: { out: "cursor" } },
      );
      const row = rows[0] as PanelistInviteRow | undefined;
      if (!row) return null;
      const extra = (await extrasWhere(db, "id = :id", { id })).get(id);
      return {
        ...row,
        panelist_role: extra?.panelist_role ?? null,
        invite_note: extra?.invite_note ?? null,
      };
    },

    // Emails the invite (best effort — the row is kept if mail fails).
    async invite(
      eventId: number,
      email: string,
      invitedBy: string,
      extra?: { role?: string; note?: string },
    ): Promise<number> {
      const db = await source();
      const out = await db.call<{ id: number }>(
        `BEGIN gcode_panelists_api.invite_panelist(
           p_event_id => :eventId, p_email => :email,
           p_invited_by => :invitedBy, p_id => :id); END;`,
        { eventId, email, invitedBy, id: { out: "number" } },
      );
      if (extra?.role || extra?.note) {
        const table = await tableOf(db);
        if (table) {
          try {
            await db.execute(
              `UPDATE ${table} SET panelist_role = :role, invite_note = :note WHERE id = :id`,
              {
                role: extra.role ?? "JUDGE",
                note: extra.note ?? null,
                id: out.id,
              },
            );
          } catch {
            // The invite exists; only the role could not be saved.
          }
        }
      }
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
