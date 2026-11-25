// Custom registration questions (incl. the advanced follow-up tree) → the
// UI model. Draft → payload builders live in src/lib/event-draft/payloads.ts.

import { EventQuestion } from "@/lib/event";
import type {
  AdvancedOption,
  AdvancedOptionSetting,
  EventQuestion as EventQuestionDto,
} from "@/server/modules/questions/questions.schemas";

type AdvancedQuestionNode = {
  id: number | string | null;
  label: string;
  settingId?: number | null;
  advancedEnabled: boolean;
  advancedRequired: boolean;
  advancedOptions: AdvancedQuestionNode[];
};

type QuestionWithAdvancedNodes = {
  id: number | string | null;
  allowOther: boolean;
  options: AdvancedQuestionNode[];
};

export function attachAdvancedQuestionConfiguration<
  T extends QuestionWithAdvancedNodes,
>(
  questions: T[],
  settings: AdvancedOptionSetting[],
  options: AdvancedOption[],
): T[] {
  const attach = (
    questionId: number,
    settingId: number,
    stringIds: boolean,
  ): AdvancedQuestionNode[] =>
    options
      .filter((option) => option.settingId === settingId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((option) => {
        const childSetting = settings.find(
          (setting) =>
            setting.questionId === questionId &&
            setting.parentAdvancedOptionId === option.id,
        );
        return {
          id: stringIds ? String(option.id) : option.id,
          label: option.label,
          settingId: childSetting?.settingId,
          advancedEnabled: childSetting?.enabled ?? false,
          advancedRequired: childSetting?.required ?? false,
          advancedOptions: childSetting
            ? attach(questionId, childSetting.settingId, stringIds)
            : [],
        };
      });
  return questions.map(
    (question) =>
      ({
        ...question,
        allowOther: settings.some(
          (setting) =>
            setting.questionId === Number(question.id) && setting.allowOther,
        ),
        options: question.options.map((option) => {
          const stringIds = typeof question.id === "string";
          // The option's own (top-level) setting: no parent follow-up.
          const setting = settings.find(
            (item) =>
              item.questionId === Number(question.id) &&
              item.sourceOptionId === Number(option.id) &&
              item.parentAdvancedOptionId === null,
          );
          return setting
            ? {
                ...option,
                settingId: setting.settingId,
                advancedEnabled: setting.enabled,
                advancedRequired: setting.required,
                advancedOptions: attach(
                  Number(question.id),
                  setting.settingId,
                  stringIds,
                ),
              }
            : option;
        }),
      }) as T,
  );
}

// Saved question → the UI's EventQuestion (ids as strings, follow-ups
// attached separately by attachAdvancedQuestionConfiguration).
export function adaptEventQuestion(row: EventQuestionDto): EventQuestion {
  return {
    id: String(row.id),
    prompt: row.prompt,
    type: row.type,
    required: row.required,
    appliesTo: row.appliesTo,
    sortOrder: row.sortOrder,
    options: [...row.options]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => ({
        id: String(o.id),
        label: o.label,
        advancedOptions: [],
        advancedEnabled: false,
        advancedRequired: false,
      })),
    allowOther: false,
  };
}
