"use client";

import { Card, Checkbox, SectionLabel, Radio } from "@/components/atoms";
import { UpdateEventDetailData, EventDetailData } from "@/lib/zod/event";

const AGE_CATEGORY_REQUIREMENT_OPTIONS: {
  value: EventDetailData["ageCategoryRequirement"];
  label: string;
  description: string;
}[] = [
  { value: "OFF", label: "Off", description: "Not asked at all." },
  {
    value: "OPTIONAL",
    label: "Optional",
    description: "Asked, but participants aren't required to answer.",
  },
  {
    value: "REQUIRED",
    label: "Required",
    description: "Asked and marked as required.",
  },
];

export interface StepAdditionalInfoProps {
  data: EventDetailData;
  onChange: UpdateEventDetailData;
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
          These settings only apply to Participant-category registrants —
          each toggle controls a section they&apos;ll see on their
          post-registration additional-info page.
        </p>
      </div>

      <Card padding="md" className="space-y-3">
        <Checkbox
          label="Enable audio recording"
          checked={data.audioRecordingEnabled}
          onChange={(e) => onChange("audioRecordingEnabled", e.target.checked)}
        />
        <p className="text-small text-text-secondary pl-7">
          When off, participants aren&apos;t asked to submit an audio
          recording for this event.
        </p>
      </Card>

      <Card padding="md" className="space-y-3">
        <Checkbox
          label="Enable track submission"
          checked={data.trackSubmissionEnabled}
          onChange={(e) =>
            onChange("trackSubmissionEnabled", e.target.checked)
          }
        />
        <p className="text-small text-text-secondary pl-7">
          When on, participants can add their own YouTube track links (track
          name + URL, any number).
        </p>
      </Card>

      <Card padding="md" className="space-y-3">
        <Checkbox
          label="Collect team member names"
          checked={data.memberNamesEnabled}
          onChange={(e) => onChange("memberNamesEnabled", e.target.checked)}
        />
        <p className="text-small text-text-secondary pl-7">
          When on, participants can list their team member names (any
          number).
        </p>
      </Card>

      <Card padding="md" className="space-y-3">
        <SectionLabel>Age Category</SectionLabel>
        <div className="space-y-3">
          {AGE_CATEGORY_REQUIREMENT_OPTIONS.map((option) => {
            const id = `age-category-requirement-${option.value}`;
            return (
              <div key={option.value} className="flex items-start gap-2">
                <Radio
                  id={id}
                  name="age-category-requirement"
                  checked={data.ageCategoryRequirement === option.value}
                  onChange={() =>
                    onChange("ageCategoryRequirement", option.value)
                  }
                />
                <label htmlFor={id} className="cursor-pointer">
                  <span className="text-body text-text-primary block">
                    {option.label}
                  </span>
                  <span className="text-small text-text-secondary">
                    {option.description}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
