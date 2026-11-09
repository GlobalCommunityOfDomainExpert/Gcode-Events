import { ReactNode } from "react";

export interface SectionHeaderProps {
  title: string;
  /** One short line — what this section is for. */
  description?: string;
  /** Primary action(s), right-aligned. */
  actions?: ReactNode;
}

/** Heading row for an organizer section: title + one-liner left, the primary action right. */
export function SectionHeader({
  title,
  description,
  actions,
}: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h2 className="text-heading text-text-primary font-extrabold tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-body text-text-secondary mt-0.5 max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
      )}
    </div>
  );
}
