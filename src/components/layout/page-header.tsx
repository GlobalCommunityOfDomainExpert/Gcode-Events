import { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Icon, SectionLabel } from "@/components/atoms";

export interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Badges / meta row rendered under the title. */
  meta?: ReactNode;
  actions?: ReactNode;
  /** A `BackLink` that replaces the eyebrow on drill-down pages. */
  back?: ReactNode;
}

/** Eyebrow, title, subtitle, actions on the right, one faint red glow. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
  back,
}: PageHeaderProps) {
  return (
    <div className="relative pb-6">
      <span
        aria-hidden="true"
        className="bg-secondary/5 pointer-events-none absolute -top-10 right-0 -z-10 size-72 rounded-full blur-3xl"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {back}
          {eyebrow && !back && <SectionLabel>{eyebrow}</SectionLabel>}
          <h1 className="text-display text-primary mt-1 leading-tight font-extrabold tracking-tight">
            {title}
          </h1>
          {meta && <div className="mt-2 flex flex-wrap gap-2">{meta}</div>}
          {subtitle && (
            <p className="text-body text-text-secondary mt-1 max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
        )}
      </div>
    </div>
  );
}

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-small text-text-secondary hover:text-text-primary focus-visible:ring-primary mb-1.5 inline-flex items-center gap-1 rounded-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <Icon icon={ArrowLeft} size="sm" /> {children}
    </Link>
  );
}
