"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { Icon } from "@/components/atoms";
import type { EventFaq } from "@/lib/event";

// Exclusive accordion: opening one answer closes the other. `page` is the
// event-page look; `compact` fits inside the "Ask a question" modal.
export function FaqAccordion({
  faqs,
  variant = "page",
  defaultOpen = null,
}: {
  faqs: EventFaq[];
  variant?: "page" | "compact";
  /** Index open on first render, or null for all closed. */
  defaultOpen?: number | null;
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const base = useId();
  const compact = variant === "compact";

  return (
    <ul className={compact ? "space-y-1.5" : "space-y-2.5"}>
      {faqs.map((faq, i) => {
        const isOpen = open === i;
        const panelId = `${base}-a-${i}`;
        return (
          <li
            key={`${i}-${faq.question}`}
            className={`rounded-lg border transition-colors ${
              isOpen
                ? "border-[color-mix(in_srgb,var(--color-primary)_35%,transparent)] bg-surface-light shadow-sm"
                : "border-border-light bg-surface-light hover:border-border-hover"
            }`}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen(isOpen ? null : i)}
              className={`flex w-full items-start gap-3 text-left ${
                compact ? "px-3 py-2.5" : "px-4 py-3.5 sm:px-5"
              }`}
            >
              {!compact && (
                <span
                  className={`text-small mt-0.5 w-6 shrink-0 font-semibold tabular-nums ${
                    isOpen ? "text-secondary" : "text-text-secondary/70"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              )}
              <span
                className={`text-text-primary min-w-0 flex-1 ${
                  compact ? "text-small font-medium" : "font-semibold"
                }`}
              >
                {faq.question}
              </span>
              <span
                className={`flex shrink-0 items-center justify-center rounded-full transition-all ${
                  compact ? "size-5" : "size-6"
                } ${
                  isOpen
                    ? "bg-primary rotate-45 text-white"
                    : "bg-bg-light text-text-secondary"
                }`}
              >
                <Icon icon={Plus} size="sm" className="size-3.5" />
              </span>
            </button>
            {/* grid-rows 0fr→1fr animates height without measuring */}
            <div
              id={panelId}
              role="region"
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <p
                  className={`text-text-secondary whitespace-pre-line ${
                    compact
                      ? "text-small px-3 pb-3"
                      : "text-body pr-4 pb-4 pl-[3.25rem] sm:pr-5 sm:pl-14"
                  }`}
                >
                  {faq.answer}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
