import "server-only";
import {
  toAdvancedOption,
  toAdvancedSetting,
  toEventQuestions,
} from "./questions.mapper";
import {
  createQuestionsRepository,
  type QuestionsRepository,
} from "./questions.repository";
import type { EventQuestion, EventQuestions } from "./questions.schemas";

const questionsRepository = createQuestionsRepository();

// `repo` lets a caller read inside its own transaction (e.g. the event save
// reading back freshly replaced question ids).
export async function listQuestions(
  eventId: number,
  repo: QuestionsRepository = questionsRepository,
): Promise<EventQuestion[]> {
  const [questions, options] = await Promise.all([
    repo.questions(eventId),
    repo.options(eventId),
  ]);
  return toEventQuestions(questions, options);
}

export const questionsService = {
  async forEvent(eventId: number): Promise<EventQuestions> {
    const [questions, enabled] = await Promise.all([
      listQuestions(eventId),
      questionsRepository.advancedEnabled(eventId),
    ]);
    // The follow-up tree only matters when the feature is switched on.
    const [settings, options] = enabled
      ? await Promise.all([
          questionsRepository.advancedSettings(eventId),
          questionsRepository.advancedOptions(eventId),
        ])
      : [[], []];
    return {
      questions,
      advanced: {
        enabled,
        settings: settings.map(toAdvancedSetting),
        options: options.map(toAdvancedOption),
      },
    };
  },
};
