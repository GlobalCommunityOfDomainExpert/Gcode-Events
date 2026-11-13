export interface Stat {
  label: string;
  value: string;
  trend?: string;
  sub?: string;
}

export interface StatStripProps {
  stats: Stat[];
}

const columnClasses: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

/** Dashboard figures: plain numbers in ONE card, divided by hairlines. */
export function StatStrip({ stats }: StatStripProps) {
  return (
    <dl
      className={`bg-surface-light divide-border-light ring-primary/10 grid gap-px divide-y rounded-lg shadow-sm ring-1 sm:divide-y-0 ${
        columnClasses[stats.length] ?? "sm:grid-cols-3"
      }`}
    >
      {stats.map((s) => (
        <div key={s.label} className="px-6 py-5">
          <dt className="text-small text-text-secondary font-medium">
            {s.label}
          </dt>
          <dd className="text-heading text-text-primary mt-1 leading-none font-extrabold tracking-tight tabular-nums">
            {s.value}
            {s.trend && (
              <span className="text-small text-success ml-2 font-semibold tracking-normal">
                {s.trend}
              </span>
            )}
          </dd>
          <dd className="text-small text-text-secondary mt-1.5">
            {s.sub ?? " "}
          </dd>
        </div>
      ))}
    </dl>
  );
}
