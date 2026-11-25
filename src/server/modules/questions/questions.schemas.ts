// API contract for an event's custom registration questions, including the
// "advanced" follow-up tree (extra choices revealed under a CHECKBOX option).
// Shared with src/lib/api/events.ts.

export type QuestionType = "TEXT" | "RADIO" | "CHECKBOX";

export interface EventQuestionOption {
  id: number;
  label: string;
  sortOrder: number;
}

export interface EventQuestion {
  id: number;
  prompt: string;
  type: QuestionType;
  required: boolean;
  // Which registration category is asked this question.
  appliesTo: "ATTENDEE" | "PARTICIPANT";
  sortOrder: number;
  options: EventQuestionOption[];
}

// Follow-up settings for one option: a top-level CHECKBOX option
// (parentAdvancedOptionId null) or a nested follow-up choice.
export interface AdvancedOptionSetting {
  settingId: number;
  questionId: number;
  sourceOptionId: number | null;
  parentAdvancedOptionId: number | null;
  enabled: boolean;
  required: boolean;
  allowOther: boolean;
}

// One follow-up choice, under the setting it belongs to.
export interface AdvancedOption {
  id: number;
  settingId: number;
  questionId: number;
  sourceOptionId: number | null;
  label: string;
  sortOrder: number;
}

// GET /api/v1/events/:id/questions — everything needed to render or edit
// the questions in one response.
export interface EventQuestions {
  questions: EventQuestion[];
  advanced: {
    enabled: boolean;
    settings: AdvancedOptionSetting[];
    options: AdvancedOption[];
  };
}
