"use client";

import {
  Button,
  Card,
  Checkbox,
  Input,
  Radio,
  RemoveIconButton,
  SectionLabel,
  Select,
} from "@/components/atoms";
import {
  EventDetailData,
  EventQuestionData,
  UpdateEventDetailData,
} from "@/lib/zod/event";

// Which registration category a section/question is asked of — picked
// individually per item (audio has its own, each custom question has its
// own), never one shared page-wide switch.
const APPLIES_TO_OPTIONS: {
  value: "ATTENDEE" | "PARTICIPANT";
  label: string;
}[] = [
  { value: "ATTENDEE", label: "Attendees" },
  { value: "PARTICIPANT", label: "Participants" },
];

const QUESTION_TYPE_OPTIONS: { value: EventQuestionData["type"]; label: string }[] = [
  { value: "TEXT", label: "Short answer" },
  { value: "RADIO", label: "Single choice (radio buttons)" },
  { value: "CHECKBOX", label: "Multiple choice (checkboxes)" },
];

function emptyQuestion(): EventQuestionData {
  return {
    id: null,
    prompt: "",
    type: "TEXT",
    required: false,
    appliesTo: "PARTICIPANT",
    options: [],
  };
}

function emptyOption() {
  return { id: null, label: "" };
}

export interface StepAdditionalInfoProps {
  data: EventDetailData;
  onChange: UpdateEventDetailData;
}

export function StepAdditionalInfo({
  data,
  onChange,
}: StepAdditionalInfoProps) {
  function updateQuestion(index: number, patch: Partial<EventQuestionData>) {
    onChange(
      "questions",
      data.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  }

  function addQuestion() {
    onChange("questions", [...data.questions, emptyQuestion()]);
  }

  function removeQuestion(index: number) {
    onChange(
      "questions",
      data.questions.filter((_, i) => i !== index),
    );
  }

  function updateOption(
    questionIndex: number,
    optionIndex: number,
    label: string,
  ) {
    const question = data.questions[questionIndex];
    updateQuestion(questionIndex, {
      options: question.options.map((o, i) =>
        i === optionIndex ? { ...o, label } : o,
      ),
    });
  }

  function addOption(questionIndex: number) {
    const question = data.questions[questionIndex];
    updateQuestion(questionIndex, {
      options: [...question.options, emptyOption()],
    });
  }

  function removeOption(questionIndex: number, optionIndex: number) {
    const question = data.questions[questionIndex];
    updateQuestion(questionIndex, {
      options: question.options.filter((_, i) => i !== optionIndex),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Additional Information</SectionLabel>
        <p className="text-small text-text-secondary">
          Everything below appears on a registrant&apos;s post-registration
          additional-info page. Each piece — audio recording, and every
          custom question — picks its own audience individually: Attendees
          or Participants.
        </p>
      </div>

      <Card padding="md" className="space-y-3">
        <Checkbox
          label="Enable audio recording"
          checked={data.audioRecordingEnabled}
          onChange={(e) => onChange("audioRecordingEnabled", e.target.checked)}
        />
        <p className="text-small text-text-secondary pl-7">
          When off, registrants aren&apos;t asked to submit an audio recording
          for this event.
        </p>
        {data.audioRecordingEnabled && (
          <div className="flex flex-wrap gap-4 pl-7">
            {APPLIES_TO_OPTIONS.map((option) => {
              const id = `audio-applies-to-${option.value}`;
              return (
                <Radio
                  key={option.value}
                  id={id}
                  name="audio-applies-to"
                  label={option.label}
                  checked={data.audioRecordingAppliesTo === option.value}
                  onChange={() =>
                    onChange("audioRecordingAppliesTo", option.value)
                  }
                />
              );
            })}
          </div>
        )}
      </Card>

      <Card padding="md" className="space-y-4">
        <div>
          <SectionLabel>Custom Questions</SectionLabel>
          <p className="text-small text-text-secondary">
            Short-answer, single-choice or multiple-choice questions,
            answered on the additional-info page — pick which registrants
            (Attendees or Participants) each one is asked of.
          </p>
        </div>

        <div className="space-y-4">
          {data.questions.map((question, questionIndex) => (
            <div
              key={questionIndex}
              className="border-border-light space-y-3 rounded-md border p-4"
            >
              <div className="flex items-start gap-2">
                <Input
                  placeholder="Question"
                  value={question.prompt}
                  onChange={(e) =>
                    updateQuestion(questionIndex, { prompt: e.target.value })
                  }
                  className="flex-1"
                />
                <RemoveIconButton
                  onClick={() => removeQuestion(questionIndex)}
                  ariaLabel="Remove question"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Select
                  size="sm"
                  className="w-auto"
                  value={question.type}
                  onChange={(e) =>
                    updateQuestion(questionIndex, {
                      type: e.target.value as EventQuestionData["type"],
                    })
                  }
                >
                  {QUESTION_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Select
                  size="sm"
                  className="w-auto"
                  value={question.appliesTo}
                  onChange={(e) =>
                    updateQuestion(questionIndex, {
                      appliesTo: e.target
                        .value as EventQuestionData["appliesTo"],
                    })
                  }
                >
                  {APPLIES_TO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Checkbox
                  label="Required"
                  checked={question.required}
                  onChange={(e) =>
                    updateQuestion(questionIndex, {
                      required: e.target.checked,
                    })
                  }
                />
              </div>

              {question.type !== "TEXT" && (
                <div className="space-y-2 pl-4">
                  {question.options.map((option, optionIndex) => (
                    <div
                      key={optionIndex}
                      className="flex items-center gap-2"
                    >
                      <Input
                        size="sm"
                        placeholder={`Option ${optionIndex + 1}`}
                        value={option.label}
                        onChange={(e) =>
                          updateOption(
                            questionIndex,
                            optionIndex,
                            e.target.value,
                          )
                        }
                        className="flex-1"
                      />
                      <RemoveIconButton
                        onClick={() =>
                          removeOption(questionIndex, optionIndex)
                        }
                        ariaLabel="Remove option"
                      />
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => addOption(questionIndex)}
                  >
                    + Add option
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        <Button variant="secondary" size="sm" onClick={addQuestion}>
          + Add question
        </Button>
      </Card>
    </div>
  );
}
