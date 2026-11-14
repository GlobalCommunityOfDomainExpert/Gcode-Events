export interface ProgressRingProps {
  /** 0-100 */
  value: number;
  /** Tailwind size classes, e.g. "size-16". */
  sizeClassName?: string;
  label?: string;
  tone?: "primary" | "secondary" | "success";
  /** Replaces the default "NN%" centre text. */
  children?: React.ReactNode;
}

const RADIUS = 28;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const toneStroke = {
  primary: "stroke-primary",
  secondary: "stroke-secondary",
  success: "stroke-success",
};

/** Circular completion indicator. */
export function ProgressRing({
  value,
  sizeClassName = "size-16",
  label = "Completion",
  tone = "secondary",
  children,
}: ProgressRingProps) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      className={`relative ${sizeClassName} shrink-0`}
      role="img"
      aria-label={`${label}: ${pct}%`}
    >
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          strokeWidth="6"
          className="stroke-bg-light"
        />
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className={`${toneStroke[tone]} transition-[stroke-dashoffset] duration-500`}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - pct / 100)}
        />
      </svg>
      <span className="text-small text-text-primary absolute inset-0 grid place-items-center font-bold tabular-nums">
        {children ?? <span>{pct}%</span>}
      </span>
    </div>
  );
}
