import "server-only";
import type { BindParams, CallParams, Row } from "@/infrastructure/database";
import { standalone, type DbSource } from "@/server/db/transaction";
import type { EventColumns } from "@/lib/event-draft/payloads";
import type { ListEventsQuery } from "./events.schemas";

// Carried over from the ORDS list handler, which hard-coded these two ids
// out of every listing (internal/test events). They're still reachable by
// direct id. Revisit once events have a proper visibility flag.
const HIDDEN_FROM_LISTINGS = [81, 61];

export interface EventSummaryRow {
  id: number;
  event_name: string;
  event_type_id: number;
  mode_of_event_id: number;
  status_id: number;
  city: string | null;
  address: string | null;
  start_date: Date | null;
  end_date: Date | null;
  max_attendees: number | null;
  ticket_price: number | null;
  is_featured: number | null;
  cover_image_url: string | null;
  card_image_url?: string | null;
  banner_image_url: string | null;
  participation_link: string | null;
  registered_count: number;
  [key: string]: unknown;
}

// Columns of GCODE_EVENTS_API.get_event's cursor (lower-cased).
export interface EventDetailRow extends EventSummaryRow {
  summary: string | null;
  description: string | null;
  duration_text: string | null;
  terms: string | null;
  eligibility: string | null;
  stages_json: string | null;
  certificate_offered: number | null;
  organizer_id: string | null;
  organizer_name: string | null;
  created_by: string | null;
  created_on: Date | null;
  updated_by: string | null;
  updated_on: Date | null;
  // JSON_ARRAYAGG: a JSON string, or already-parsed on JSON-native databases.
  category_ids: string | number[] | null;
  category_names: string | string[] | null;
  interested_count: number | null;
  attendee_registration_enabled: number | null;
  attendee_label: string | null;
  attendee_description: string | null;
  registration_start: Date | null;
  registration_deadline: Date | null;
  max_tickets_per_registration: number | null;
  participant_registration_enabled: number | null;
  participant_label: string | null;
  participant_description: string | null;
  participant_price: number | null;
  participant_capacity: number | null;
  participant_registered_count: number | null;
  participant_registration_start: Date | null;
  participant_registration_deadline: Date | null;
  participant_max_tickets_per_registration: number | null;
  rating_mode: string | null;
  audio_recording_enabled: number | null;
  audio_recording_applies_to: string | null;
}

export interface TimelineRow {
  title: string;
  description: string | null;
  start_time: Date | null;
  end_time: Date | null;
  location: string | null;
  day_label: string | null;
  sort_order: number | null;
  [key: string]: unknown;
}

export function createEventsRepository(source: DbSource = standalone) {
  return {
    async list(
      q: ListEventsQuery,
    ): Promise<{ rows: EventSummaryRow[]; total: number }> {
      const where = [`e.id NOT IN (${HIDDEN_FROM_LISTINGS.join(", ")})`];
      const binds: BindParams = { limit: q.limit, offset: q.offset };
      if (q.featured !== undefined) {
        where.push("NVL(e.is_featured, 0) = :featured");
        binds.featured = q.featured ? 1 : 0;
      }
      if (q.typeId) {
        where.push("e.event_type_id = :typeId");
        binds.typeId = q.typeId;
      }
      if (q.modeId) {
        where.push("e.mode_of_event_id = :modeId");
        binds.modeId = q.modeId;
      }
      if (q.statusId) {
        where.push("e.status_id = :statusId");
        binds.statusId = q.statusId;
      }
      if (q.categoryId) {
        where.push(
          "EXISTS (SELECT 1 FROM event_category_map m WHERE m.event_id = e.id AND m.category_id = :categoryId)",
        );
        binds.categoryId = q.categoryId;
      }
      if (q.search) {
        // INSTR, not LIKE: a "%" or "_" typed by the user is matched literally.
        where.push("INSTR(UPPER(e.title), UPPER(:search)) > 0");
        binds.search = q.search;
      }

      const db = await source();
      const { rows } = await db.query<
        EventSummaryRow & { total_count: number }
      >(
        `SELECT e.id, e.title AS event_name, e.event_type_id, e.mode_of_event_id,
              e.status_id, e.city, e.venue_address AS address, e.start_date,
              e.end_date, e.max_attendees, e.ticket_price, e.is_featured,
              e.cover_image_url, e.card_image_url, e.banner_image_url,
              e.participation_link,
              (SELECT NVL(SUM(p.quantity), 0) FROM gcode_event_participants p
                WHERE p.event_id = e.id AND p.active = 'Y') AS registered_count,
              COUNT(*) OVER () AS total_count
         FROM events e
        WHERE ${where.join("\n          AND ")}
        ORDER BY e.start_date DESC NULLS LAST, e.id DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
        binds,
      );
      return { rows, total: rows[0]?.total_count ?? 0 };
    },

    // Phase 1: still the PL/SQL query (GCODE_EVENTS_API.get_event).
    async getById(id: number): Promise<EventDetailRow | null> {
      const db = await source();
      const { rows } = await db.call<{ rows: Row[] }>(
        "BEGIN gcode_events_api.get_event(:id, :rows); END;",
        { id, rows: { out: "cursor" } },
      );
      const row = (rows[0] as EventDetailRow | undefined) ?? null;
      // get_event's cursor predates the card image; read it directly when
      // the procedure doesn't return it.
      if (row && !("card_image_url" in row)) {
        const card = await db.queryOne<{ card_image_url: string | null }>(
          "SELECT card_image_url FROM events WHERE id = :id",
          { id },
        );
        row.card_image_url = card?.card_image_url ?? null;
      }
      return row;
    },

    async timeline(eventId: number): Promise<TimelineRow[]> {
      const db = await source();
      const { rows } = await db.query<TimelineRow>(
        `SELECT title, description, start_time, end_time, location, day_label, sort_order
         FROM event_timeline WHERE event_id = :eventId
        ORDER BY sort_order NULLS LAST, id`,
        { eventId },
      );
      return rows;
    },

    async faqs(eventId: number) {
      const db = await source();
      const { rows } = await db.query<{
        question: string;
        answer: string;
        sort_order: number | null;
      }>(
        `SELECT question, answer, sort_order FROM gcode_event_faqs
        WHERE event_id = :eventId ORDER BY sort_order NULLS LAST, id`,
        { eventId },
      );
      return rows;
    },

    async media(eventId: number) {
      const db = await source();
      const { rows } = await db.query<{
        url: string;
        sort_order: number | null;
      }>(
        `SELECT url, sort_order FROM event_media
        WHERE event_id = :eventId ORDER BY sort_order NULLS LAST, id`,
        { eventId },
      );
      return rows;
    },

    async socialLinks(eventId: number) {
      const db = await source();
      const { rows } = await db.query<{ platform: string; url: string }>(
        "SELECT platform, url FROM event_social_links WHERE event_id = :eventId ORDER BY id",
        { eventId },
      );
      return rows;
    },

    async partners(eventId: number) {
      const db = await source();
      const { rows } = await db.query<{
        name: string;
        role: string;
        logo_url: string | null;
        url: string | null;
        about: string | null;
        sort_order: number | null;
      }>(
        `SELECT name, role, logo_url, url, about, sort_order
         FROM gcode_event_partners
        WHERE event_id = :eventId ORDER BY sort_order NULLS LAST, id`,
        { eventId },
      );
      return rows;
    },

    async partnerCount(eventId: number): Promise<number> {
      const db = await source();
      const row = await db.queryOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM gcode_event_partners WHERE event_id = :eventId",
        { eventId },
      );
      return row?.n ?? 0;
    },

    // Full replace, in the caller's transaction. Order = sort_order.
    async replacePartners(
      eventId: number,
      items: {
        name: string;
        role: string;
        logoUrl: string | null;
        url: string | null;
        about: string | null;
      }[],
    ): Promise<void> {
      const db = await source();
      await db.execute(
        "DELETE FROM gcode_event_partners WHERE event_id = :eventId",
        { eventId },
      );
      for (const [sortOrder, p] of items.entries()) {
        await db.execute(
          `INSERT INTO gcode_event_partners
             (event_id, name, role, logo_url, url, about, sort_order)
           VALUES (:eventId, :name, :role, :logoUrl, :url, :about, :sortOrder)`,
          { eventId, ...p, sortOrder },
        );
      }
    },

    async cardImageUrl(eventId: number): Promise<string | null> {
      const db = await source();
      const row = await db.queryOne<{ card_image_url: string | null }>(
        "SELECT card_image_url FROM events WHERE id = :eventId",
        { eventId },
      );
      return row?.card_image_url ?? null;
    },

    // A linked (not uploaded) card image, or null to clear it.
    async setCardImageUrl(eventId: number, url: string | null): Promise<void> {
      const db = await source();
      await db.execute(
        "UPDATE events SET card_image_url = :url WHERE id = :eventId",
        { eventId, url },
      );
    },

    async cardImage(eventId: number) {
      const db = await source();
      return db.queryOne<{
        card_image: Buffer | null;
        card_image_mime: string | null;
      }>("SELECT card_image, card_image_mime FROM events WHERE id = :eventId", {
        eventId,
      });
    },

    // Same storage model as setCoverImage.
    async setCardImage(
      eventId: number,
      bytes: Buffer,
      mime: string,
    ): Promise<boolean> {
      const db = await source();
      const updated = await db.execute(
        `UPDATE events
          SET card_image = :bytes, card_image_mime = :mime,
              card_image_url = '/events/' || id || '/card-image-file',
              updated_on = SYSTIMESTAMP
        WHERE id = :eventId`,
        { eventId, bytes, mime },
      );
      return updated > 0;
    },

    async coverImage(eventId: number) {
      const db = await source();
      return db.queryOne<{
        cover_image: Buffer | null;
        cover_image_mime: string | null;
      }>(
        "SELECT cover_image, cover_image_mime FROM events WHERE id = :eventId",
        {
          eventId,
        },
      );
    },

    // ── Writes (still through GCODE_EVENTS_API where it exists) ───────────

    async create(
      columns: EventColumns,
      extra: { createdBy: string; organizerId: string },
    ): Promise<number> {
      const db = await source();
      const { params, binds } = eventParams(
        {
          ...columns,
          created_by: extra.createdBy,
          organizer_id: extra.organizerId,
        },
        CREATE_PARAMS,
      );
      const out = await db.call<{ id: number }>(
        `BEGIN gcode_events_api.create_event(${params}, p_id => :id); END;`,
        { ...binds, id: { out: "number" } },
      );
      return out.id;
    },

    // update_event leaves every NULL/omitted column unchanged (NVL).
    async update(
      id: number,
      columns: Partial<EventColumns>,
      updatedBy: string,
    ): Promise<void> {
      const db = await source();
      const { params, binds } = eventParams(
        { ...columns, updated_by: updatedBy },
        UPDATE_PARAMS,
      );
      await db.call(
        `BEGIN gcode_events_api.update_event(p_id => :eventId, ${params}); END;`,
        { ...binds, eventId: id },
      );
    },

    async delete(id: number): Promise<void> {
      const db = await source();
      // EVENT_SOCIAL_LINKS has no foreign key to EVENTS, so delete_event's
      // cascade misses it; clear it first (same transaction) so no orphan
      // rows are left behind. Every other child table cascades.
      await db.execute("DELETE FROM event_social_links WHERE event_id = :id", {
        id,
      });
      await db.call("BEGIN gcode_events_api.delete_event(:id); END;", { id });
    },

    async exists(id: number): Promise<boolean> {
      const db = await source();
      return (
        (await db.queryOne("SELECT 1 AS found FROM events WHERE id = :id", {
          id,
        })) !== null
      );
    },

    // Full-replace child collections: the procedure deletes the event's rows
    // and re-inserts from a JSON array (keys as each procedure's JSON_TABLE).
    async replaceChildren(
      eventId: number,
      kind: "timeline" | "social_links" | "media" | "faqs",
      itemsJson: string,
    ): Promise<void> {
      const db = await source();
      await db.call(
        `BEGIN gcode_events_api.replace_${kind}(:eventId, :items); END;`,
        { eventId, items: itemsJson },
      );
    },

    // Rounds move to their own module in the rounds step.
    async replaceRounds(eventId: number, itemsJson: string): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_rounds_api.replace_rounds(:eventId, :items); END;",
        {
          eventId,
          items: itemsJson,
        },
      );
    },

    async categoryIds(eventId: number): Promise<number[]> {
      const db = await source();
      const { rows } = await db.query<{ category_id: number }>(
        "SELECT category_id FROM event_category_map WHERE event_id = :eventId",
        { eventId },
      );
      return rows.map((r) => r.category_id);
    },

    async assignCategory(eventId: number, categoryId: number): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_events_api.assign_category(:eventId, :categoryId); END;",
        {
          eventId,
          categoryId,
        },
      );
    },

    async removeCategory(eventId: number, categoryId: number): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_events_api.remove_category(:eventId, :categoryId); END;",
        {
          eventId,
          categoryId,
        },
      );
    },

    async faqCount(eventId: number): Promise<number> {
      const db = await source();
      const row = await db.queryOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM gcode_event_faqs WHERE event_id = :eventId",
        { eventId },
      );
      return row?.n ?? 0;
    },

    // Stores the cover in the database. cover_image_url keeps the old ORDS
    // path: it's what the other app (and existing rows) use, and our mapper
    // turns it into /api/v1/events/:id/cover-image.
    async setCoverImage(
      eventId: number,
      bytes: Buffer,
      mime: string,
    ): Promise<boolean> {
      const db = await source();
      const updated = await db.execute(
        `UPDATE events
          SET cover_image = :bytes, cover_image_mime = :mime,
              cover_image_url = '/events/' || id || '/cover-image-file',
              updated_on = SYSTIMESTAMP
        WHERE id = :eventId`,
        { eventId, bytes, mime },
      );
      return updated > 0;
    },
  };
}

export const eventsRepository = createEventsRepository();
export type EventsRepository = ReturnType<typeof createEventsRepository>;

// ── create_event / update_event parameter binding ──────────────────────
// The procedures take ~45 named parameters, all defaulted. Only columns the
// caller actually set are passed, so the rest keep their defaults (create)
// or saved values (update). Parameter names come from these allow-lists,
// never from input, so nothing user-supplied reaches the SQL text.

const SHARED_PARAMS = [
  "title",
  "event_type_id",
  "mode_of_event_id",
  "status_id",
  "summary",
  "description",
  "start_date",
  "end_date",
  "registration_start",
  "registration_deadline",
  "city",
  "venue_address",
  "participation_link",
  "max_attendees",
  "ticket_price",
  "is_featured",
  "certificate_offered",
  "cover_image_url",
  "banner_image_url",
  "is_external",
  "external_url",
  "organizer_id",
  "max_tickets_per_registration",
  "terms",
  "eligibility",
  "duration_text",
  "attendee_label",
  "attendee_description",
  "attendee_registration_enabled",
  "participant_registration_enabled",
  "participant_label",
  "participant_description",
  "participant_price",
  "participant_capacity",
  "participant_max_tickets_per_registration",
  "participant_registration_start",
  "participant_registration_deadline",
  "audio_recording_enabled",
  "age_category_requirement",
  "track_submission_enabled",
  "member_names_enabled",
  "audio_recording_applies_to",
  "stages_json",
] as const;
const CREATE_PARAMS = new Set<string>([...SHARED_PARAMS, "created_by"]);
const UPDATE_PARAMS = new Set<string>([
  ...SHARED_PARAMS,
  "updated_by",
  "rating_mode",
]);

// TIMESTAMP WITH TIME ZONE parameters: bound as Date so the instant is
// exact (a string would be parsed with the session's NLS format).
const DATE_PARAMS = new Set([
  "start_date",
  "end_date",
  "registration_start",
  "registration_deadline",
  "participant_registration_start",
  "participant_registration_deadline",
]);

function eventParams(
  columns: Record<string, unknown>,
  allowed: Set<string>,
): { params: string; binds: CallParams } {
  const names: string[] = [];
  const binds: CallParams = {};
  for (const [name, value] of Object.entries(columns)) {
    if (value === undefined || !allowed.has(name)) continue;
    names.push(`p_${name} => :${name}`);
    binds[name] =
      DATE_PARAMS.has(name) && typeof value === "string"
        ? new Date(value)
        : (value as CallParams[string]);
  }
  return { params: names.join(", "), binds };
}
