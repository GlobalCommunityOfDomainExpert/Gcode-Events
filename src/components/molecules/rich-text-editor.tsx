"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Bold, Italic, List, Underline, type LucideIcon } from "lucide-react";
import { Icon, Textarea } from "@/components/atoms";
import { RichText } from "./rich-text";

type Mark = "**" | "*" | "__";

const TOOLS: {
  label: string;
  shortcut?: string;
  icon: LucideIcon;
  mark?: Mark;
}[] = [
  { label: "Bold", shortcut: "Ctrl+B", icon: Bold, mark: "**" },
  { label: "Italic", shortcut: "Ctrl+I", icon: Italic, mark: "*" },
  { label: "Underline", shortcut: "Ctrl+U", icon: Underline, mark: "__" },
  { label: "Bulleted list", icon: List },
];

/**
 * Textarea with a Bold / Italic / Underline / Bullets toolbar. It writes the
 * markdown subset that <RichText> renders, so the stored value stays a plain
 * string. "Preview" shows exactly what the event page will show.
 */
export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
  rows = 6,
  error,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  error?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  // Controlled textarea: write the new value, then put the selection back
  // once React has re-rendered it.
  function commit(next: string, start: number, end: number) {
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
    });
  }

  function toggleMark(mark: Mark) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const n = mark.length;
    const before = value.slice(0, s);
    const selected = value.slice(s, e);
    const after = value.slice(e);
    // Already wrapped (markers just outside the selection)? Unwrap.
    // "*" must not mistake one half of "**" for its own marker.
    const wrapped =
      before.endsWith(mark) &&
      after.startsWith(mark) &&
      !(mark === "*" && (before.endsWith("**") || after.startsWith("**")));
    if (wrapped) {
      commit(before.slice(0, -n) + selected + after.slice(n), s - n, e - n);
      return;
    }
    commit(before + mark + selected + mark + after, s + n, e + n);
  }

  function toggleBullets() {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const nl = value.indexOf("\n", e);
    const lineEnd = nl === -1 ? value.length : nl;
    const lines = value.slice(lineStart, lineEnd).split("\n");
    const allBulleted = lines.every((l) => /^- /.test(l) || !l.trim());
    const next = lines
      .map((l) =>
        !l.trim() ? l : allBulleted ? l.replace(/^- /, "") : `- ${l}`,
      )
      .join("\n");
    commit(
      value.slice(0, lineStart) + next + value.slice(lineEnd),
      lineStart,
      lineStart + next.length,
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const el = event.currentTarget;
    if (event.ctrlKey || event.metaKey) {
      const mark = ({ b: "**", i: "*", u: "__" } as const)[
        event.key.toLowerCase() as "b" | "i" | "u"
      ];
      if (mark) {
        event.preventDefault();
        toggleMark(mark);
      }
      return;
    }
    // Enter inside a bullet continues the list; Enter on an empty bullet
    // ends it.
    if (event.key === "Enter" && !event.shiftKey) {
      const s = el.selectionStart;
      if (s !== el.selectionEnd) return;
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const line = value.slice(lineStart, s);
      if (!/^- /.test(line)) return;
      event.preventDefault();
      if (line.trim() === "-") {
        commit(
          value.slice(0, lineStart) + value.slice(s),
          lineStart,
          lineStart,
        );
      } else {
        const insert = "\n- ";
        commit(
          value.slice(0, s) + insert + value.slice(s),
          s + insert.length,
          s + insert.length,
        );
      }
    }
  }

  const tab = (on: boolean) =>
    `text-small rounded-sm px-2.5 py-1 font-semibold transition-colors ${
      on
        ? "bg-surface-light text-text-primary shadow-sm"
        : "text-text-secondary hover:text-text-primary"
    }`;

  return (
    <div
      className={`overflow-hidden rounded-sm border ${error ? "border-danger" : "border-border-light focus-within:border-primary"}`}
    >
      <div className="bg-bg-light border-border-light flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <div
          role="toolbar"
          aria-label="Formatting"
          aria-controls={id}
          className="flex items-center gap-0.5"
        >
          {TOOLS.map((tool) => (
            <button
              key={tool.label}
              type="button"
              disabled={preview}
              // Keep the textarea's selection when clicking a tool.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                tool.mark ? toggleMark(tool.mark) : toggleBullets()
              }
              aria-label={tool.label}
              title={
                tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label
              }
              className="text-text-secondary hover:bg-surface-light hover:text-text-primary grid size-8 place-items-center rounded-sm transition-colors disabled:pointer-events-none disabled:opacity-40"
            >
              <Icon icon={tool.icon} size="sm" className="size-4" />
            </button>
          ))}
        </div>
        <div className="bg-bg-subtle flex rounded-sm p-0.5">
          <button
            type="button"
            className={tab(!preview)}
            aria-pressed={!preview}
            onClick={() => setPreview(false)}
          >
            Write
          </button>
          <button
            type="button"
            className={tab(preview)}
            aria-pressed={preview}
            onClick={() => setPreview(true)}
          >
            Preview
          </button>
        </div>
      </div>

      {preview ? (
        <div
          className="bg-surface-light px-4 py-3"
          style={{ minHeight: `${rows * 1.6 + 1}rem` }}
        >
          {value.trim() ? (
            <RichText
              value={value}
              className="text-body text-text-secondary space-y-3 leading-relaxed"
            />
          ) : (
            <p className="text-small text-text-secondary italic">
              Nothing to preview yet.
            </p>
          )}
        </div>
      ) : (
        <Textarea
          ref={ref}
          id={id}
          value={value}
          rows={rows}
          error={error}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="rounded-none border-0 shadow-none focus-visible:ring-0"
        />
      )}
    </div>
  );
}
