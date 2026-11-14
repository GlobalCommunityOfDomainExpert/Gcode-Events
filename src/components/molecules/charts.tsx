"use client";

import { ReactNode, useId, useState } from "react";

/* ------------------------------------------------------------------ */
/* AreaChart — smooth line + soft gradient fill, hover crosshair.      */
/* ------------------------------------------------------------------ */

export interface ChartPoint {
  label: string;
  value: number;
}

export interface AreaChartProps {
  points: ChartPoint[];
  /** Noun used in the tooltip and aria text, e.g. "registration". */
  unit?: string;
  height?: number;
}

const W = 600;
const PAD = { top: 12, right: 12, bottom: 24, left: 28 };

function niceMax(max: number): number {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Monotone-ish smoothing: cubic segments with horizontal control handles. */
function smoothPath(coords: [number, number][]): string {
  if (coords.length === 0) return "";
  let d = `M ${coords[0][0]} ${coords[0][1]}`;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  return d;
}

export function AreaChart({
  points,
  unit = "item",
  height = 200,
}: AreaChartProps) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left +
    (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const coords = points.map((p, i): [number, number] => [x(i), y(p.value)]);
  const line = smoothPath(coords);
  const area = coords.length
    ? `${line} L ${coords[coords.length - 1][0]} ${PAD.top + innerH} L ${coords[0][0]} ${PAD.top + innerH} Z`
    : "";
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  // Show at most ~6 x labels.
  const step = Math.max(1, Math.ceil(points.length / 6));

  const active = hover !== null ? points[hover] : null;
  const total = points.reduce((s, p) => s + p.value, 0);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${unit} chart: ${total} total across ${points.length} days`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const i = Math.round(
            ((px - PAD.left) / innerW) * (points.length - 1),
          );
          setHover(Math.min(points.length - 1, Math.max(0, i)));
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              className="[stop-color:var(--color-secondary)]"
              stopOpacity="0.28"
            />
            <stop
              offset="100%"
              className="[stop-color:var(--color-secondary)]"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-border-light"
              strokeDasharray={t === 0 ? undefined : "3 4"}
            />
            <text
              x={PAD.left - 6}
              y={y(t) + 3}
              textAnchor="end"
              className="fill-text-secondary text-[10px]"
            >
              {t}
            </text>
          </g>
        ))}

        {points.map((p, i) =>
          i % step === 0 || i === points.length - 1 ? (
            <text
              key={p.label + i}
              x={x(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-text-secondary text-[10px]"
            >
              {p.label}
            </text>
          ) : null,
        )}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          className="stroke-secondary"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hover !== null && active && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              className="stroke-primary/30"
            />
            <circle
              cx={x(hover)}
              cy={y(active.value)}
              r="5"
              className="fill-surface-light stroke-secondary"
              strokeWidth="2.5"
            />
          </g>
        )}
      </svg>

      {hover !== null && active && (
        <div
          className="bg-primary text-small pointer-events-none absolute top-0 -translate-x-1/2 rounded-sm px-2.5 py-1.5 font-medium whitespace-nowrap text-white shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          {active.label}: {active.value} {unit}
          {active.value === 1 ? "" : "s"}
        </div>
      )}

      <table className="sr-only">
        <caption>{unit} per day</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DonutChart                                                          */
/* ------------------------------------------------------------------ */

export type ChartTone =
  "primary" | "secondary" | "success" | "warning" | "muted";

const toneStroke: Record<ChartTone, string> = {
  primary: "stroke-primary",
  secondary: "stroke-secondary",
  success: "stroke-success",
  warning: "stroke-warning",
  muted: "stroke-text-secondary/40",
};
const toneBg: Record<ChartTone, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  success: "bg-success",
  warning: "bg-warning",
  muted: "bg-text-secondary/40",
};

export interface DonutSegment {
  label: string;
  value: number;
  tone: ChartTone;
}

export interface DonutChartProps {
  segments: DonutSegment[];
  /** Big number in the centre. */
  centerValue?: ReactNode;
  centerLabel?: string;
}

const R = 40;
const C = 2 * Math.PI * R;

export function DonutChart({
  segments,
  centerValue,
  centerLabel,
}: DonutChartProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        className="relative size-32 shrink-0"
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}
      >
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="12"
            className="stroke-bg-light"
          />
          {total > 0 &&
            segments.map((seg) => {
              const len = (seg.value / total) * C;
              const el = (
                <circle
                  key={seg.label}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  strokeWidth="12"
                  className={`${toneStroke[seg.tone]} transition-[stroke-dasharray] duration-500`}
                  strokeDasharray={`${Math.max(0, len - 1.5)} ${C - Math.max(0, len - 1.5)}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-heading text-text-primary leading-none font-extrabold tabular-nums">
              {centerValue ?? total}
            </p>
            {centerLabel && (
              <p className="text-small text-text-secondary mt-0.5">
                {centerLabel}
              </p>
            )}
          </div>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${toneBg[seg.tone]}`} />
            <span className="text-small text-text-secondary flex-1">
              {seg.label}
            </span>
            <span className="text-small text-text-primary font-semibold tabular-nums">
              {seg.value}
              {total > 0 && (
                <span className="text-text-secondary ml-1 font-normal">
                  {Math.round((seg.value / total) * 100)}%
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* BarList — labelled horizontal bars (funnels, breakdowns).           */
/* ------------------------------------------------------------------ */

export interface BarListRow {
  label: string;
  value: number;
  /** Small text under the label (e.g. a conversion rate). */
  sub?: string;
  tone?: ChartTone;
}

export interface BarListProps {
  rows: BarListRow[];
  /** Bar scale; defaults to the largest row. */
  max?: number;
}

export function BarList({ rows, max }: BarListProps) {
  const scale = Math.max(1, max ?? Math.max(...rows.map((r) => r.value)));
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="text-small flex items-baseline justify-between gap-3">
            <span className="text-text-primary font-medium">{row.label}</span>
            <span className="text-text-primary font-semibold tabular-nums">
              {row.value.toLocaleString()}
            </span>
          </div>
          <div
            className="bg-bg-light mt-1 h-2 overflow-hidden rounded-full"
            role="presentation"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${toneBg[row.tone ?? "primary"]}`}
              style={{ width: `${Math.min(100, (row.value / scale) * 100)}%` }}
            />
          </div>
          {row.sub && (
            <p className="text-small text-text-secondary mt-1">{row.sub}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* ChartCard — shared frame for dashboard widgets.                     */
/* ------------------------------------------------------------------ */

export interface ChartCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function ChartCard({
  title,
  description,
  action,
  className = "",
  children,
}: ChartCardProps) {
  return (
    <section
      className={`bg-surface-light ring-primary/10 rounded-lg p-5 shadow-sm ring-1 sm:p-6 ${className}`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-body text-text-primary font-bold tracking-tight">
            {title}
          </h3>
          {description && (
            <p className="text-small text-text-secondary">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
