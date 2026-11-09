export type ProgressTone =
  "primary" | "secondary" | "success" | "warning" | "danger";

export interface ProgressProps {
  value: number;
  max?: number;
  tone?: ProgressTone;
  label?: string;
  className?: string;
}

const toneClasses: Record<ProgressTone, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function Progress({
  value,
  max = 100,
  tone = "primary",
  label = "Progress",
  className = "",
}: ProgressProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={`bg-bg-light h-2 w-full overflow-hidden rounded-full ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] ${toneClasses[tone]}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
