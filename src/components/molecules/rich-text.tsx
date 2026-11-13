import type { ReactNode } from "react";

/*
 * Event descriptions are stored as plain text with a tiny markdown subset, so
 * the backend column stays a string and old descriptions render unchanged:
 *
 *   **bold**   *italic*   __underline__   "- " at line start = bullet
 *
 * Every line is its own block (the API already splits on "\n"); consecutive
 * bullet lines become one list. Rendered as React nodes — never as HTML — so
 * organizer text can't inject markup.
 */

const BULLET = /^\s*[-•*]\s+/;
// Italic skips over a nested **bold** so "*a **b** c*" stays one italic run.
const INLINE = /\*\*(.+?)\*\*|__(.+?)__|\*(?!\*)((?:\*\*.+?\*\*|[^*])+?)\*/;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[1] !== undefined) {
      out.push(
        <strong
          key={key++}
          className="font-semibold text-[color-mix(in_srgb,var(--color-secondary-hover)_25%,var(--color-text-primary))]"
        >
          {inline(m[1])}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      out.push(
        <u key={key++} className="underline-offset-2">
          {inline(m[2])}
        </u>,
      );
    } else {
      out.push(<em key={key++}>{inline(m[3])}</em>);
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

type Block = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

function toBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    if (BULLET.test(raw)) {
      const item = raw.replace(BULLET, "");
      const last = blocks[blocks.length - 1];
      if (last?.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
    } else {
      blocks.push({ kind: "p", text: raw });
    }
  }
  return blocks;
}

/** Renders a description — pass the API's line array or the raw string. */
export function RichText({
  value,
  className = "",
  paragraphClassName = "",
}: {
  value: string | string[];
  className?: string;
  paragraphClassName?: string;
}) {
  const lines = Array.isArray(value) ? value : value.split("\n");
  return (
    <div className={className}>
      {toBlocks(lines).map((block, i) =>
        block.kind === "p" ? (
          <p key={i} className={paragraphClassName}>
            {inline(block.text)}
          </p>
        ) : (
          <ul
            key={i}
            className={`marker:text-text-secondary list-disc space-y-1 pl-5 ${paragraphClassName}`}
          >
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/** Plain text for places that can't show formatting (previews, meta tags). */
export function stripRichText(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(BULLET, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/\*(.+?)\*/g, "$1"),
    )
    .join("\n");
}
