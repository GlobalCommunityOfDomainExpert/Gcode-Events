"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Ban,
  Copy,
  CornerDownLeft,
  Download,
  ExternalLink,
  LayoutDashboard,
  PencilLine,
  Receipt,
  Search,
  Settings,
  Tag,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/atoms";
import type { Event } from "@/lib/event";
import { eventTools } from "@/lib/organizer";

// "Jump to…" for one event's dashboard (Ctrl/⌘ K): every section and the
// actions organizers look for most, filtered to what this event type uses.

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: "Go to" | "Actions";
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

export function JumpTo({
  event,
  onNotify,
}: {
  event: Event;
  onNotify: (m: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tools = eventTools(event);
  const base = `/my-organized-events/${event.id}`;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => router.push(`${base}${path}`);
    const list: Item[] = [
      {
        id: "overview",
        label: "Overview",
        group: "Go to",
        icon: LayoutDashboard,
        keywords: "dashboard stats home",
        run: go(""),
      },
      {
        id: "attendees",
        label: "Attendees",
        group: "Go to",
        icon: Users,
        keywords: "people registrations check in list",
        run: go("/attendees"),
      },
      {
        id: "panelists",
        label: tools.judging ? "Judges & panelists" : "Panelists",
        group: "Go to",
        icon: UserCheck,
        keywords: "judges mentors speakers",
        run: go("/panelists"),
      },
      ...(tools.judging
        ? [
            {
              id: "rounds",
              label: "Rounds & judging",
              group: "Go to" as const,
              icon: Trophy,
              keywords: "scores shortlist leaderboard",
              run: go("/rounds"),
            },
          ]
        : []),
      ...(tools.money
        ? [
            {
              id: "upi",
              label: "UPI claims",
              group: "Go to" as const,
              icon: Receipt,
              keywords: "payments verify money",
              run: go("/upi-claims"),
            },
            {
              id: "coupons",
              label: "Coupons",
              group: "Go to" as const,
              icon: Tag,
              keywords: "discount codes",
              run: go("/coupons"),
            },
          ]
        : []),
      {
        id: "settings",
        label: "Settings",
        group: "Go to",
        icon: Settings,
        keywords: "cancel delete danger",
        run: go("/settings"),
      },

      {
        id: "invite",
        label: tools.judging ? "Invite a judge" : "Invite a panelist",
        group: "Actions",
        icon: UserPlus,
        keywords: "panelist judge add",
        run: go("/panelists?invite=1"),
      },
      {
        id: "export",
        label: "Export attendee list",
        group: "Actions",
        icon: Download,
        keywords: "excel csv download",
        run: go("/attendees"),
      },
      ...(tools.money
        ? [
            {
              id: "coupon",
              label: "Create a coupon",
              group: "Actions" as const,
              icon: Tag,
              keywords: "discount",
              run: go("/coupons?new=1"),
            },
          ]
        : []),
      {
        id: "edit",
        label: "Edit event details",
        group: "Actions",
        icon: PencilLine,
        keywords: "change update title date",
        run: go("/edit"),
      },
      {
        id: "public",
        label: "View public page",
        group: "Actions",
        icon: ExternalLink,
        run: () => window.open(`/events/${event.id}`, "_blank"),
      },
      {
        id: "copy",
        label: "Copy event link",
        group: "Actions",
        icon: Copy,
        keywords: "share url",
        run: () => {
          void navigator.clipboard?.writeText(
            `${window.location.origin}/events/${event.id}`,
          );
          onNotify("Event link copied");
        },
      },
      {
        id: "cancel",
        label: "Cancel this event",
        group: "Actions",
        icon: Ban,
        keywords: "delete stop",
        run: go("/settings?action=cancel"),
      },
    ];
    return list;
  }, [base, event.id, onNotify, router, tools.judging, tools.money]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((i) =>
      `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(t),
    );
  }, [items, q]);

  function close() {
    setOpen(false);
    setQ("");
    setActive(0);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function choose(i: Item) {
    close();
    i.run();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="border-border-light bg-surface-light text-text-secondary hover:border-border-hover hover:text-text-primary text-small inline-flex h-9 items-center gap-2 rounded-sm border px-3 shadow-sm transition-colors"
      >
        <Icon icon={Search} size="sm" className="size-4" />
        Jump to…
        <kbd className="bg-bg-light text-text-secondary ml-2 rounded px-1.5 py-0.5 font-mono text-[11px]">
          Ctrl K
        </kbd>
      </button>

      {open &&
        createPortal(
          <div
            className="bg-primary/40 fixed inset-0 z-[150] flex items-start justify-center px-4 pt-[12vh]"
            onClick={close}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Jump to"
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-light w-full max-w-lg overflow-hidden rounded-lg shadow-2xl"
            >
              <div className="border-border-light flex items-center gap-3 border-b px-4">
                <Icon
                  icon={Search}
                  size="sm"
                  className="text-text-secondary size-4"
                />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") close();
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActive((a) => Math.min(a + 1, results.length - 1));
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActive((a) => Math.max(a - 1, 0));
                    }
                    if (e.key === "Enter" && results[active])
                      choose(results[active]);
                  }}
                  placeholder={`Search ${event.title}…`}
                  className="text-body h-12 min-w-0 flex-1 bg-transparent outline-none"
                />
                <kbd className="bg-bg-light text-text-secondary rounded px-1.5 py-0.5 font-mono text-[11px]">
                  Esc
                </kbd>
              </div>
              <div className="max-h-[50vh] overflow-y-auto py-2">
                {results.length === 0 && (
                  <p className="text-small text-text-secondary px-4 py-6 text-center">
                    Nothing matches “{q}”.
                  </p>
                )}
                {(["Go to", "Actions"] as const).map((group) => {
                  const rows = results.filter((r) => r.group === group);
                  if (!rows.length) return null;
                  return (
                    <div key={group} className="py-1">
                      <p className="text-text-secondary px-4 py-1 text-xs font-semibold tracking-wider uppercase">
                        {group}
                      </p>
                      {rows.map((r) => {
                        const idx = results.indexOf(r);
                        const on = idx === active;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onMouseEnter={() => setActive(idx)}
                            onClick={() => choose(r)}
                            className={`text-small flex w-full items-center gap-3 px-4 py-2 text-left ${on ? "bg-bg-light text-text-primary" : "text-text-primary"}`}
                          >
                            <Icon
                              icon={r.icon}
                              size="sm"
                              className={`size-4 ${r.id === "cancel" ? "text-danger" : "text-text-secondary"}`}
                            />
                            <span
                              className={`flex-1 ${r.id === "cancel" ? "text-danger" : ""}`}
                            >
                              {r.label}
                            </span>
                            {on && (
                              <Icon
                                icon={CornerDownLeft}
                                size="sm"
                                className="text-text-secondary size-3.5"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
