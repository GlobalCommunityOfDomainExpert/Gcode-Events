import { ReactNode } from "react";

export interface SettingGroupProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

/** Settings layout: label + description left, controls right, hairline between groups. */
export function SettingGroup({
  title,
  description,
  children,
}: SettingGroupProps) {
  return (
    <div className="border-border-light grid gap-x-12 gap-y-4 border-t py-6 first:border-t-0 first:pt-2 last:pb-0 md:grid-cols-[14rem_minmax(0,1fr)] md:py-8">
      <div>
        <h3 className="text-body text-text-primary font-semibold">{title}</h3>
        {description && (
          <p className="text-small text-text-secondary mt-1 md:max-w-56">
            {description}
          </p>
        )}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  );
}

export interface ValueLineProps {
  text: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}

/** "value ... action" line inside a group (e.g. a public link with a Copy button). */
export function ValueLine({ text, sub, action }: ValueLineProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="text-body text-text-primary font-medium break-all">
          {text}
        </p>
        {sub && <p className="text-small text-text-secondary">{sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{action}</div>
    </div>
  );
}
