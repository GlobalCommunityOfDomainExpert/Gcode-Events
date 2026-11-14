"use client";

import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Icon } from "@/components/atoms";
import { useMounted } from "@/hooks/use-mounted";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small line under the title (e.g. an email). */
  subtitle?: string;
  /** Rendered left of the title (e.g. an Avatar). */
  lead?: ReactNode;
  children: ReactNode;
  /** Pinned to the bottom of the panel. */
  footer?: ReactNode;
}

/** Right-hand detail panel: keeps the list visible behind it, unlike a centred Modal. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  lead,
  children,
  footer,
}: DrawerProps) {
  const mounted = useMounted();

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="bg-primary/40 fixed inset-0 z-50" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="bg-surface-light absolute inset-y-0 right-0 flex w-full max-w-md flex-col shadow-lg"
      >
        <header className="border-border-light flex items-start gap-3 border-b px-5 py-4">
          {lead}
          <div className="min-w-0 flex-1">
            <h2 className="text-large text-text-primary truncate font-bold tracking-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-small text-text-secondary truncate">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-text-secondary hover:text-text-primary focus-visible:ring-primary rounded-sm p-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Icon icon={X} size="sm" />
          </button>
        </header>
        <div className="text-body text-text-primary flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>
        {footer && (
          <footer className="border-border-light flex flex-wrap justify-end gap-2 border-t px-5 py-4">
            {footer}
          </footer>
        )}
      </aside>
    </div>,
    document.body,
  );
}
