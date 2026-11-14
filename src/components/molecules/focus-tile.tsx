import { ReactNode } from "react";
import { Progress, SectionLabel } from "@/components/atoms";

export interface FocusTileProps {
  eyebrow: string;
  value: string;
  label: string;
  text: string;
  /** Buttons / links rendered on the right. */
  actions?: ReactNode;
  /** Urgent look (red wash) — e.g. registration closing soon, or a cancelled event. */
  urgent?: boolean;
  /** 0–100 — shows a completion bar under the text. */
  progress?: number;
  progressLabel?: string;
  /** Extra line under everything, e.g. a second, lower-priority nudge. */
  footer?: ReactNode;
}

/** Dashboard hero: the ONE thing that needs attention right now. */
export function FocusTile({
  eyebrow,
  value,
  label,
  text,
  actions,
  urgent = false,
  progress,
  progressLabel = "Completion",
  footer,
}: FocusTileProps) {
  return (
    <section
      className={`bg-surface-light rounded-lg bg-linear-to-b p-6 ring-1 sm:p-8 ${
        urgent
          ? "from-secondary-light to-secondary-light ring-secondary/25"
          : "from-primary-light to-primary-light ring-primary/10"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 flex-1 basis-72">
          <SectionLabel
            className={urgent ? "text-secondary!" : "text-primary!"}
          >
            {eyebrow}
          </SectionLabel>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={`text-display leading-none font-extrabold tracking-tight tabular-nums ${
                urgent ? "text-secondary" : "text-primary"
              }`}
            >
              {value}
            </span>
            <span className="text-large text-text-primary font-semibold">
              {label}
            </span>
          </div>
          <p className="text-body text-text-secondary mt-2 max-w-xl">{text}</p>
          {progress !== undefined && (
            <div className="mt-4 max-w-xs">
              <Progress
                value={progress}
                label={progressLabel}
                tone={urgent ? "secondary" : "primary"}
              />
            </div>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        )}
      </div>
      {footer && (
        <div className="border-border-light/70 mt-5 border-t pt-4">
          {footer}
        </div>
      )}
    </section>
  );
}
