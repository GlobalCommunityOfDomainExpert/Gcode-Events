import "server-only";
import { getDatabase } from "@/infrastructure/database";

// Row shapes exactly as the database returns them (lower-cased columns).
export interface EventTypeRow {
  id: number;
  name: string;
  description: string | null;
  [key: string]: unknown;
}
export interface EventStatusRow {
  id: number;
  status_code: string;
  status_name: string;
  description: string | null;
  [key: string]: unknown;
}
export interface EventModeRow {
  id: number;
  mode_name: string;
  description: string | null;
  [key: string]: unknown;
}
export interface CategoryRow {
  id: number;
  category_name: string;
  description: string | null;
  [key: string]: unknown;
}

export const lookupsRepository = {
  async eventTypes() {
    const db = await getDatabase();
    const { rows } = await db.query<EventTypeRow>(
      "SELECT id, name, description FROM event_types ORDER BY id",
    );
    return rows;
  },

  async statuses() {
    const db = await getDatabase();
    const { rows } = await db.query<EventStatusRow>(
      "SELECT id, status_code, status_name, description FROM event_status ORDER BY id",
    );
    return rows;
  },

  async modes() {
    const db = await getDatabase();
    const { rows } = await db.query<EventModeRow>(
      "SELECT id, mode_name, description FROM mode_of_events ORDER BY id",
    );
    return rows;
  },

  async categories() {
    const db = await getDatabase();
    const { rows } = await db.query<CategoryRow>(
      "SELECT id, category_name, description FROM event_categories ORDER BY id",
    );
    return rows;
  },
};
