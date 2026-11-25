import "server-only";
import type { Row } from "@/infrastructure/database";
import { standalone, type DbSource } from "@/server/db/transaction";

// Registrations. Writes go through GCODE_EVENT_PARTICIPANTS_API (Phase 1);
// create/update/delete/submit_audio COMMIT inside the package, so they
// can't join a wider transaction. replace_answers and save_answers don't.

export interface MyParticipationRow {
  participant_id: number;
  event_id: number;
  event_name: string;
  event_type_id: number;
  mode_of_event_id: number;
  status_id: number;
  start_date: Date | null;
  city: string | null;
  address: string | null;
  ticket_price: number | null;
  participant_price: number | null;
  cover_image_url: string | null;
  quantity: number;
  status: string | null;
  active: string;
  applied_on: Date;
  category: string | null;
  [key: string]: unknown;
}

// Columns of get_participant / list_by_event cursors.
export interface ParticipantRow {
  id: number;
  event_id: number;
  user_id: string | null;
  user_name: string | null;
  quantity: number;
  status: string | null;
  active: string | null;
  applied_on: Date | null;
  email: string | null;
  phone: string | null;
  role_name: string | null;
  category: string | null;
  audio_submission_url: string | null;
  audio_submitted_on: Date | null;
  [key: string]: unknown;
}

export interface CreateParticipantInput {
  eventId: number;
  userId?: string;
  email?: string;
  fullName?: string;
  phone?: string;
  quantity: number;
  category: string;
  skipWindowCheck: boolean;
  skipEmailVerification: boolean;
}

export function createParticipantsRepository(source: DbSource = standalone) {
  return {
    async listByUser(userId: string): Promise<MyParticipationRow[]> {
      const db = await source();
      const { rows } = await db.call<{ rows: Row[] }>(
        "BEGIN gcode_event_participants_api.list_by_user(TO_NUMBER(:userId), :rows); END;",
        { userId, rows: { out: "cursor" } },
      );
      return rows as MyParticipationRow[];
    },

    async listByEvent(eventId: number): Promise<ParticipantRow[]> {
      const db = await source();
      const { rows } = await db.call<{ rows: Row[] }>(
        "BEGIN gcode_event_participants_api.list_by_event(:eventId, :rows); END;",
        { eventId, rows: { out: "cursor" } },
      );
      return rows as ParticipantRow[];
    },

    async getById(id: number): Promise<ParticipantRow | null> {
      const db = await source();
      const { rows } = await db.call<{ rows: Row[] }>(
        "BEGIN gcode_event_participants_api.get_participant(:id, :rows); END;",
        { id, rows: { out: "cursor" } },
      );
      return (rows[0] as ParticipantRow | undefined) ?? null;
    },

    // An active, non-cancelled registration for this person, if any.
    async findActiveRegistration(
      eventId: number,
      who: { userId?: string; email?: string },
    ): Promise<number | null> {
      const db = await source();
      const row = await db.queryOne<{ id: number }>(
        `SELECT MIN(p.id) AS id
           FROM gcode_event_participants p
           JOIN gcode_users u ON u.user_id = p.user_id
          WHERE p.event_id = :eventId AND p.active = 'Y' AND p.status <> 'CANCELLED'
            AND (u.user_id = TO_NUMBER(:userId) OR u.email = :email)`,
        { eventId, userId: who.userId ?? null, email: who.email ?? null },
      );
      return row?.id ?? null;
    },

    async create(input: CreateParticipantInput): Promise<number> {
      const db = await source();
      const out = await db.call<{ id: number }>(
        `BEGIN gcode_event_participants_api.create_participant(
           p_event_id => :eventId, p_email => :email, p_full_name => :fullName,
           p_phone => :phone, p_user_id => TO_NUMBER(:userId),
           p_quantity => :quantity, p_category => :category,
           p_skip_window_check => :skipWindow,
           p_skip_email_verification => :skipVerification,
           p_id => :id); END;`,
        {
          eventId: input.eventId,
          email: input.email ?? null,
          fullName: input.fullName ?? null,
          phone: input.phone ?? null,
          userId: input.userId ?? null,
          quantity: input.quantity,
          category: input.category,
          skipWindow: input.skipWindowCheck ? "Y" : "N",
          skipVerification: input.skipEmailVerification ? "Y" : "N",
          id: { out: "number" },
        },
      );
      return out.id;
    },

    // Soft delete: status CANCELLED, active N (history is kept).
    async cancel(id: number): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_event_participants_api.delete_participant(:id); END;",
        { id },
      );
    },

    // Enforces the 24h submission window; emails a receipt.
    async submitAudio(id: number, url: string): Promise<Date | null> {
      const db = await source();
      const out = await db.call<{ submittedOn: Date | null }>(
        "BEGIN gcode_event_participants_api.submit_audio(:id, :url, :submittedOn); END;",
        { id, url, submittedOn: { out: "date" } },
      );
      return out.submittedOn;
    },

    async answers(participantId: number) {
      const db = await source();
      const { rows } = await db.query<{
        question_id: number;
        option_id: number | null;
        answer_text: string | null;
      }>(
        `SELECT question_id, option_id, answer_text FROM participant_question_answers
          WHERE participant_id = :participantId ORDER BY id`,
        { participantId },
      );
      return rows;
    },

    async advancedAnswers(participantId: number) {
      const db = await source();
      const { rows } = await db.query<{
        setting_id: number;
        question_id: number;
        source_option_id: number | null;
        parent_adv_option_id: number | null;
        adv_option_id: number | null;
        is_other: number | null;
        answer_text: string | null;
      }>(
        `SELECT setting_id, question_id, source_option_id, parent_adv_option_id,
                adv_option_id, is_other, answer_text
           FROM gcode_event_adv_answers WHERE participant_id = :participantId ORDER BY id`,
        { participantId },
      );
      return rows;
    },

    async replaceAnswers(
      participantId: number,
      itemsJson: string,
    ): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_event_participants_api.replace_answers(:participantId, :items); END;",
        { participantId, items: itemsJson },
      );
    },

    // Validates against the event's follow-up tree (required follow-ups,
    // "Other" text) and raises a readable error when something's missing.
    async saveAdvancedAnswers(
      participantId: number,
      itemsJson: string,
    ): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_event_adv_q_api.save_answers(:participantId, :items); END;",
        { participantId, items: itemsJson },
      );
    },

    async youtubeTracks(participantId: number) {
      const db = await source();
      const { rows } = await db.query<{
        track_name: string;
        youtube_url: string;
        sort_order: number | null;
      }>(
        `SELECT track_name, youtube_url, sort_order FROM participant_youtube_tracks
          WHERE participant_id = :participantId ORDER BY sort_order NULLS LAST, id`,
        { participantId },
      );
      return rows;
    },

    async teamMembers(participantId: number) {
      const db = await source();
      const { rows } = await db.query<{
        member_name: string;
        sort_order: number | null;
      }>(
        `SELECT member_name, sort_order FROM participant_team_members
          WHERE participant_id = :participantId ORDER BY sort_order NULLS LAST, id`,
        { participantId },
      );
      return rows;
    },

    async eventExists(eventId: number): Promise<boolean> {
      const db = await source();
      return (
        (await db.queryOne(
          "SELECT 1 AS found FROM events WHERE id = :eventId",
          { eventId },
        )) !== null
      );
    },
  };
}

export type ParticipantsRepository = ReturnType<
  typeof createParticipantsRepository
>;
export const participantsRepository = createParticipantsRepository();
