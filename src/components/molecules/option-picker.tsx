"use client";

import { ReactNode, useId, useRef, useState } from "react";
import { Check, ChevronDown, PencilLine } from "lucide-react";
import { Icon, Input } from "@/components/atoms";
import { useClickOutside } from "@/hooks/use-click-outside";

export interface PickerOption {
  value: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
}

export interface OptionPickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: PickerOption[];
  placeholder?: string;
  /** Adds a "Something else…" row that turns the field into free text. */
  customLabel?: string;
  customPlaceholder?: string;
}

// Select-style dropdown with icons and hints, unlike a native <select> or
// <datalist> (which filters itself down to the typed value). Values outside
// the list are kept and edited as free text when `customLabel` is set.
export function OptionPicker({
  id,
  value,
  onChange,
  options,
  placeholder = "Choose…",
  customLabel,
  customPlaceholder,
}: OptionPickerProps) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  useClickOutside(rootRef, open, () => setOpen(false));

  const selected = options.find((o) => o.value === value);
  const custom = !!customLabel && (typing || (!!value && !selected));

  function pick(next: string) {
    onChange(next);
    setTyping(false);
    setOpen(false);
  }

  if (custom) {
    return (
      <div className="flex gap-2">
        <Input
          id={id}
          autoFocus={typing}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={customPlaceholder}
        />
        <button
          type="button"
          onClick={() => {
            setTyping(false);
            onChange(options[0]?.value ?? "");
            setOpen(true);
          }}
          className="text-small text-primary shrink-0 font-semibold hover:underline"
        >
          Pick from list
        </button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="border-border-light bg-surface-light text-body hover:border-border-hover focus-visible:ring-primary flex h-11 w-full items-center gap-2 rounded-sm border px-3 text-left focus-visible:ring-2 focus-visible:outline-none"
      >
        {selected?.icon && <span className="shrink-0">{selected.icon}</span>}
        <span
          className={`min-w-0 flex-1 truncate ${selected ? "text-text-primary" : "text-text-secondary"}`}
        >
          {selected?.label ?? placeholder}
        </span>
        <Icon
          icon={ChevronDown}
          size="sm"
          className={`text-text-secondary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={id}
          className="border-border-light bg-surface-light absolute z-30 mt-1 max-h-72 w-full min-w-56 overflow-y-auto rounded-md border py-1 shadow-lg"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => pick(o.value)}
                  className={`hover:bg-bg-light focus-visible:bg-bg-light flex w-full items-center gap-2.5 px-3 py-2 text-left focus-visible:outline-none ${active ? "bg-bg-light" : ""}`}
                >
                  {o.icon && <span className="shrink-0">{o.icon}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="text-small text-text-primary block font-medium">
                      {o.label}
                    </span>
                    {o.hint && (
                      <span className="text-text-secondary block text-xs">
                        {o.hint}
                      </span>
                    )}
                  </span>
                  {active && (
                    <Icon icon={Check} size="sm" className="text-primary" />
                  )}
                </button>
              </li>
            );
          })}
          {customLabel && (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setTyping(true);
                  setOpen(false);
                }}
                className="border-border-light text-small text-text-secondary hover:bg-bg-light flex w-full items-center gap-2.5 border-t px-3 py-2 text-left"
              >
                <Icon icon={PencilLine} size="sm" /> {customLabel}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
