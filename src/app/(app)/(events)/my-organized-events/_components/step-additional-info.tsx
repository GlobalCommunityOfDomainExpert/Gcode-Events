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

// Which registration category audio recording is asked of — picked
// individually (its own radio pair), same spirit as the two question
// groups below but audio isn't a list so it doesn't need its own checkbox.
const AUDIO_APPLIES_TO_OPTIONS: {
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

function emptyQuestion(appliesTo: "ATTENDEE" | "PARTICIPANT"): EventQuestionData {
  return { id: null, prompt: "", type: "TEXT", required: false, appliesTo, options: [] };
}

function emptyOption() {
  return { id: null, label: "" };
}

export interface StepAdditionalInfoProps {
  data: EventDetailData;
  onChange: UpdateEventDetailData;
}

// One checkbox-gated block: "Ask Attendees extra questions" or "Ask
// Participants extra questions". Unchecked -> that category has no
// questions at all (any it had are dropped). Checked with none yet ->
// seeds one blank question so there's something to fill in immediately.
// Operates on `data.questions` by real array index so it shares state with
// the sibling block (the other category) without touching its rows.
function CategoryQuestions({
  category,
  label,
  data,
  onChange,
}: {
  category: "ATTENDEE" | "PARTICIPANT";
  label: string;
  data: EventDetailData;
  onChange: UpdateEventDetailData;
}) {
  const indexed = data.questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.appliesTo === category);
  const enabled = indexed.length > 0;

  function updateQuestion(index: number, patch: Partial<EventQuestionData>) {
    onChange(
      "questions",
      data.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  }

  function addQuestion() {
    onChange("questions", [...data.questions, emptyQuestion(category)]);
  }

  function removeQuestion(index: number) {
    onChange(
      "questions",
      data.questions.filter((_, i) => i !== index),
    );
  }

  function toggleEnabled(checked: boolean) {
    if (checked) {
      addQuestion();
    } else {
      onChange(
        "questions",
        data.questions.filter(({ appliesTo }: EventQuestionData) => appliesTo !== category),
      );
    }
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    const question = data.questions[questionIndex];
    updateQuestion(questionIndex, {
      options: question.options.map((o, i) =>
        i === optionIndex ? { ...o, label: value } : o,
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
    <Card padding="md" className="space-y-4">
      <Checkbox
        label={label}
        checked={enabled}
        onChange={(e) => toggleEnabled(e.target.checked)}
      />

      {enabled && (
        <div className="space-y-4 pl-7">
          {indexed.map(({ q: question, i: questionIndex }) => (
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
                    <div key={optionIndex} className="flex items-center gap-2">
                      <Input
                        size="sm"
                        placeholder={`Option ${optionIndex + 1}`}
                        value={option.label}
                        onChange={(e) =>
                          updateOption(questionIndex, optionIndex, e.target.value)
                        }
                        className="flex-1"
                      />
                      <RemoveIconButton
                        onClick={() => removeOption(questionIndex, optionIndex)}
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

          <Button variant="secondary" size="sm" onClick={addQuestion}>
            + Add question
          </Button>
        </div>
      )}
    </Card>
  );
}

export function StepAdditionalInfo({
  data,
  onChange,
}: StepAdditionalInfoProps) {
  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Additional Information</SectionLabel>
        <p className="text-small text-text-secondary">
          Everything below appears on a registrant&apos;s post-registration
          additional-info page. Audience and Participant questions are
          curated separately — turn either on to build its own set.
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
            {AUDIO_APPLIES_TO_OPTIONS.map((option) => {
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

      <CategoryQuestions
        category="ATTENDEE"
        label="Ask Audience extra questions"
        data={data}
        onChange={onChange}
      />

      <CategoryQuestions
        category="PARTICIPANT"
        label="Ask Participants extra questions"
        data={data}
        onChange={onChange}
      />
    </div>
  );
}
