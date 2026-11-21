import "server-only";
import { standalone, type DbSource } from "@/server/db/transaction";

export interface QuestionRow {
  id: number;
  prompt: string;
  question_type: string;
  is_required: number | null;
  applies_to: string | null;
  sort_order: number | null;
  [key: string]: unknown;
}

export interface QuestionOptionRow {
  id: number;
  question_id: number;
  option_label: string;
  sort_order: number | null;
  [key: string]: unknown;
}

export interface AdvancedSettingRow {
  setting_id: number;
  question_id: number;
  source_option_id: number | null;
  parent_adv_option_id: number | null;
  is_enabled: number | null;
  is_required: number | null;
  allow_other: number | null;
  [key: string]: unknown;
}

export interface AdvancedOptionRow {
  id: number;
  setting_id: number;
  question_id: number;
  source_option_id: number | null;
  option_label: string;
  sort_order: number | null;
  [key: string]: unknown;
}

export function createQuestionsRepository(source: DbSource = standalone) {
  return {
    async questions(eventId: number): Promise<QuestionRow[]> {
      const db = await source();
      const { rows } = await db.query<QuestionRow>(
        `SELECT id, prompt, question_type, is_required, applies_to, sort_order
           FROM gcode_event_questions WHERE event_id = :eventId
          ORDER BY sort_order NULLS LAST, id`,
        { eventId },
      );
      return rows;
    },

    async options(eventId: number): Promise<QuestionOptionRow[]> {
      const db = await source();
      const { rows } = await db.query<QuestionOptionRow>(
        `SELECT o.id, o.question_id, o.option_label, o.sort_order
           FROM gcode_event_question_options o
           JOIN gcode_event_questions q ON q.id = o.question_id
          WHERE q.event_id = :eventId
          ORDER BY o.question_id, o.sort_order NULLS LAST, o.id`,
        { eventId },
      );
      return rows;
    },

    // Full replace: deletes every question (cascading to options and
    // answers) and re-inserts from the JSON array (QuestionPayloadItem[]).
    async replace(eventId: number, itemsJson: string): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_events_api.replace_questions(:eventId, :items); END;",
        { eventId, items: itemsJson },
      );
    },

    async advancedEnabled(eventId: number): Promise<boolean> {
      const db = await source();
      const row = await db.queryOne<{ advanced_enabled: number | null }>(
        "SELECT advanced_enabled FROM gcode_event_adv_q_settings WHERE event_id = :eventId",
        { eventId },
      );
      return Number(row?.advanced_enabled ?? 0) === 1;
    },

    async setAdvancedEnabled(eventId: number, enabled: boolean): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_event_adv_q_api.set_enabled(:eventId, :enabled); END;",
        { eventId, enabled: enabled ? 1 : 0 },
      );
    },

    async saveAdvancedConfiguration(
      eventId: number,
      itemsJson: string,
    ): Promise<void> {
      const db = await source();
      await db.call(
        "BEGIN gcode_event_adv_q_api.save_configuration(:eventId, :items); END;",
        { eventId, items: itemsJson },
      );
    },

    async advancedSettings(eventId: number): Promise<AdvancedSettingRow[]> {
      const db = await source();
      const { rows } = await db.query<AdvancedSettingRow>(
        `SELECT id AS setting_id, question_id, source_option_id, parent_adv_option_id,
                is_enabled, is_required, allow_other
           FROM gcode_event_adv_option_settings WHERE event_id = :eventId
          ORDER BY question_id, source_option_id, parent_adv_option_id`,
        { eventId },
      );
      return rows;
    },

    async advancedOptions(eventId: number): Promise<AdvancedOptionRow[]> {
      const db = await source();
      const { rows } = await db.query<AdvancedOptionRow>(
        `SELECT o.id, o.setting_id, s.question_id, s.source_option_id,
                o.option_label, o.sort_order
           FROM gcode_event_adv_options o
           JOIN gcode_event_adv_option_settings s ON s.id = o.setting_id
          WHERE s.event_id = :eventId AND o.is_active = 1
          ORDER BY s.question_id, s.source_option_id, o.sort_order, o.id`,
        { eventId },
      );
      return rows;
    },
  };
}

export type QuestionsRepository = ReturnType<typeof createQuestionsRepository>;
