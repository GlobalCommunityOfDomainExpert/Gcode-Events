"use client";

import Link from "next/link";
import { ArrowRight, LayoutDashboard, Pencil, ShieldCheck } from "lucide-react";
import { Icon } from "@/components/atoms";
import { useSession } from "@/hooks/use-session";
import { isAdmin } from "@/lib/auth/session";
import type { Event } from "@/lib/event";

const STATUS_DOT: Record<string, string> = {
  OPEN: "bg-success",
  ONGOING: "bg-success",
  APPROVAL_PENDING: "bg-warning",
  DRAFT: "bg-border-hover",
  REGISTRATION_CLOSED: "bg-warning",
  COMPLETED: "bg-text-secondary",
  CANCELLED: "bg-secondary",
};

// "REGISTRATION_CLOSED" → "Registration closed"
const titleCase = (code: string) =>
  code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " ");

// Shortcut to the organizer dashboard for admins. Saves going Organizing ▸ My organized events ▸ search ▸ open.
// Glass styling matches the compact /events filter bar.
// Sits in normal page flow (not sticky) so it never overlaps content.
export function OrganizerBar({ event }: { event: Event }) {
  const session = useSession();
  // Admin-only for now: the /my-organized-events routes are guarded as
  // ADMIN-only (EventsAppLayout), so an ORGANIZER-role owner would click
  // through and be redirected. To show it to the event's owner too, widen
  // that route guard first, then allow: roleName === "ORGANIZER" &&
  // session.userId === event.organizerId (the role check matters: an
  // attendee can share the same user id).
  if (!isAdmin(session)) return null;

  const dashboardHref = `/my-organized-events/${event.id}`;
  const registered = event.capacity
    ? `${event.registeredCount}/${event.capacity}`
    : `${event.registeredCount}`;

  return (
    <div className="border-border-light relative -mb-4 flex items-center gap-3 rounded-lg border bg-[color-mix(in_srgb,var(--color-surface-light)_88%,transparent)] py-2 pr-2 pl-3 shadow-md backdrop-blur-[16px]">
      <span className="bg-primary flex size-8 shrink-0 items-center justify-center rounded-sm text-white shadow-sm">
        <Icon icon={ShieldCheck} size="sm" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-small text-text-primary truncate font-semibold">
          Admin view
        </p>
        <p className="text-text-secondary flex items-center gap-1.5 truncate text-xs">
          {event.status && (
            <span className="text-text-primary inline-flex items-center gap-1 font-medium">
              <span
                aria-hidden
                className={`size-1.5 rounded-full ${STATUS_DOT[event.status] ?? "bg-border-hover"}`}
              />
              {titleCase(event.status)}
              <span className="text-text-secondary font-normal">·</span>
            </span>
          )}
          <span className="truncate">
            {registered}
            <span className="hidden sm:inline"> registered</span>
            {event.interestedCount ? (
              <span className="hidden sm:inline">
                {" "}
                · {event.interestedCount} interested
              </span>
            ) : null}
          </span>
        </p>
      </div>

      <Link
        href={`${dashboardHref}/edit`}
        className="text-text-secondary hover:bg-bg-light hover:text-text-primary text-small hidden shrink-0 items-center gap-1.5 rounded-sm px-3 py-2 font-medium transition-colors sm:inline-flex"
      >
        <Icon icon={Pencil} size="sm" className="size-3.5" />
        Edit
      </Link>
      <Link
        href={dashboardHref}
        className="bg-primary hover:bg-primary-hover text-small inline-flex shrink-0 items-center gap-1.5 rounded-sm px-3 py-2 font-semibold text-white shadow-sm transition-colors"
      >
        <Icon icon={LayoutDashboard} size="sm" className="size-4" />
        <span className="hidden sm:inline">Open dashboard</span>
        <span className="sm:hidden">Dashboard</span>
        <Icon icon={ArrowRight} size="sm" className="size-3.5" />
      </Link>
    </div>
  );
}
