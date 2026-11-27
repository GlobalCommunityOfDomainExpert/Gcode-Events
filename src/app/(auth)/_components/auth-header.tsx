import { ReactNode } from "react";

export interface AuthHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Small label above the title, e.g. "Step 1 of 3". */
  eyebrow?: string;
}

/** Title block at the top of each auth page's form column. */
export function AuthHeader({ title, subtitle, eyebrow }: AuthHeaderProps) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <p className="text-small text-secondary mb-2 font-semibold">{eyebrow}</p>
      )}
      <h1 className="text-text-primary text-[1.9rem] leading-tight font-bold tracking-[-0.02em]">
        {title}
      </h1>
      {subtitle && (
        <p className="text-body text-text-secondary mt-2">{subtitle}</p>
      )}
    </div>
  );
}
