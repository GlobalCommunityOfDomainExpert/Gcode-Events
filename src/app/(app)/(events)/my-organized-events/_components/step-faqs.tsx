"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Button,
  Card,
  Icon,
  Input,
  RemoveIconButton,
  Textarea,
} from "@/components/atoms";
import { FormField } from "@/components/molecules";
import type { EventFaq } from "@/lib/event";
import { UpdateEventDetailData, EventDetailData } from "@/lib/zod/event";

// Questions attendees ask most — one tap adds a row with the question filled.
const STARTERS = [
  "Who is this event for?",
  "What should I bring?",
  "Is the ticket refundable?",
  "Is there parking at the venue?",
  "Will sessions be recorded?",
  "Can I register as a group?",
];

export interface StepFaqsProps {
  data: EventDetailData;
  onChange: UpdateEventDetailData;
}

export function StepFaqs({ data, onChange }: StepFaqsProps) {
  const faqs = data.faqs;
  const set = (next: EventFaq[]) => onChange("faqs", next);
  const used = new Set(faqs.map((f) => f.question.trim().toLowerCase()));

  function patch(index: number, key: keyof EventFaq, value: string) {
    set(faqs.map((f, i) => (i === index ? { ...f, [key]: value } : f)));
  }
  function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= faqs.length) return;
    const next = [...faqs];
    [next[index], next[to]] = [next[to], next[index]];
    set(next);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-large text-text-primary font-semibold">FAQs</h2>
        <p className="text-body text-text-secondary">
          Answer the questions people ask before booking. They show on the event
          page and above the &ldquo;Ask a question&rdquo; form, so fewer people
          need to write in.
        </p>
      </div>

      {faqs.length === 0 && (
        <p className="text-small text-text-secondary border-border-light rounded-lg border border-dashed p-4 text-center">
          No FAQs yet — start from a common question below or add your own.
        </p>
      )}

      {faqs.map((faq, index) => (
        <Card key={index} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-small text-text-secondary font-semibold">
              Question {index + 1}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`Move question ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="text-text-secondary hover:bg-bg-light hover:text-text-primary rounded-md p-1 disabled:opacity-30"
              >
                <Icon icon={ChevronUp} size="sm" />
              </button>
              <button
                type="button"
                aria-label={`Move question ${index + 1} down`}
                disabled={index === faqs.length - 1}
                onClick={() => move(index, 1)}
                className="text-text-secondary hover:bg-bg-light hover:text-text-primary rounded-md p-1 disabled:opacity-30"
              >
                <Icon icon={ChevronDown} size="sm" />
              </button>
              <RemoveIconButton
                onClick={() => set(faqs.filter((_, i) => i !== index))}
                ariaLabel={`Remove question ${index + 1}`}
              />
            </div>
          </div>
          <FormField label="Question" htmlFor={`faq-q-${index}`}>
            <Input
              id={`faq-q-${index}`}
              value={faq.question}
              onChange={(e) => patch(index, "question", e.target.value)}
              placeholder="e.g. Can I bring my own backing track?"
            />
          </FormField>
          <FormField
            label="Answer"
            htmlFor={`faq-a-${index}`}
            error={
              faq.question.trim() && !faq.answer.trim()
                ? "Add an answer — questions without one aren't shown."
                : undefined
            }
          >
            <Textarea
              id={`faq-a-${index}`}
              rows={3}
              value={faq.answer}
              onChange={(e) => patch(index, "answer", e.target.value)}
              placeholder="Keep it short and specific."
            />
          </FormField>
        </Card>
      ))}

      <div className="space-y-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => set([...faqs, { question: "", answer: "" }])}
        >
          + Add question
        </Button>
        <div className="flex flex-wrap gap-2" aria-label="Common questions">
          {STARTERS.filter((s) => !used.has(s.toLowerCase())).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set([...faqs, { question: s, answer: "" }])}
              className="text-small border-border-light text-text-secondary hover:border-border-hover hover:text-text-primary rounded-full border px-3 py-1 font-medium transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
