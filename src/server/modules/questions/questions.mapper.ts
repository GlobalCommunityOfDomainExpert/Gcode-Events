import "server-only";
import type {
  AdvancedOptionRow,
  AdvancedSettingRow,
  QuestionOptionRow,
  QuestionRow,
} from "./questions.repository";
import type {
  AdvancedOption,
  AdvancedOptionSetting,
  EventQuestion,
  QuestionType,
} from "./questions.schemas";

const QUESTION_TYPES: QuestionType[] = ["TEXT", "RADIO", "CHECKBOX"];

export function toEventQuestions(
  questions: QuestionRow[],
  options: QuestionOptionRow[],
): EventQuestion[] {
  return questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    type: QUESTION_TYPES.find((t) => t === q.question_type) ?? "TEXT",
    required: Number(q.is_required) === 1,
    appliesTo: q.applies_to === "ATTENDEE" ? "ATTENDEE" : "PARTICIPANT",
    sortOrder: q.sort_order ?? 0,
    options: options
      .filter((o) => o.question_id === q.id)
      .map((o) => ({
        id: o.id,
        label: o.option_label,
        sortOrder: o.sort_order ?? 0,
      })),
  }));
}

export const toAdvancedSetting = (
  r: AdvancedSettingRow,
): AdvancedOptionSetting => ({
  settingId: r.setting_id,
  questionId: r.question_id,
  sourceOptionId: r.source_option_id ?? null,
  parentAdvancedOptionId: r.parent_adv_option_id || null,
  enabled: Number(r.is_enabled) === 1,
  required: Number(r.is_required) === 1,
  allowOther: Number(r.allow_other) === 1,
});

export const toAdvancedOption = (r: AdvancedOptionRow): AdvancedOption => ({
  id: r.id,
  settingId: r.setting_id,
  questionId: r.question_id,
  sourceOptionId: r.source_option_id ?? null,
  label: r.option_label,
  sortOrder: r.sort_order ?? 0,
});
