import { ReactNode } from "react";
import { Skeleton } from "@/components/atoms";

// Shared loading skeletons. Each one mirrors the real layout it stands in for
// so nothing jumps when data arrives. They only use the Skeleton atom (which
// already respects the theme tokens), and every wrapper announces itself to
// screen readers once instead of exposing each placeholder block.

function Loading({
  label = "Loading…",
  className = "",
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={className}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Page title + one-line subtitle, optionally with an action button. */
export function PageHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {action && <Skeleton className="h-11 w-32 shrink-0" />}
    </div>
  );
}

/** Row of tab labels with an underline. */
export function TabsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="border-border-light flex gap-6 border-b pb-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-20" />
      ))}
    </div>
  );
}

/** A strip of stat tiles (number + label). */
export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="border-border-light bg-surface-light space-y-3 rounded-md border p-4"
        >
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

/** A card of list rows: avatar, two text lines, trailing pill. */
export function ListRowsSkeleton({
  rows = 4,
  label,
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <Loading label={label} className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="border-border-light bg-surface-light flex items-center gap-4 rounded-md border p-4"
        >
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
        </div>
      ))}
    </Loading>
  );
}

/** A bordered table: header row + body rows. */
export function TableSkeleton({
  rows = 5,
  cols = 4,
  label,
}: {
  rows?: number;
  cols?: number;
  label?: string;
}) {
  return (
    <Loading
      label={label}
      className="border-border-light bg-surface-light overflow-hidden rounded-md border"
    >
      <div
        className="grid gap-4 px-4 py-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="border-border-light grid gap-4 border-t px-4 py-4"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={`h-4 ${c === 0 ? "w-3/4" : "w-1/2"}`}
            />
          ))}
        </div>
      ))}
    </Loading>
  );
}

/** Stacked labelled inputs. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Ticket-style rows for "My Events". */
export function TicketRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Loading label="Loading your events…" className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="border-border-light bg-surface-light flex items-center gap-4 rounded-md border p-4"
        >
          <div className="w-12 shrink-0 space-y-2">
            <Skeleton className="mx-auto h-3 w-8" />
            <Skeleton className="mx-auto h-7 w-10" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      ))}
    </Loading>
  );
}

/** "My Events" page: header + tabs card with ticket rows. */
export function MyEventsSkeleton() {
  return (
    <Loading label="Loading your events…" className="mt-10 space-y-6">
      <PageHeaderSkeleton />
      <div className="border-border-light bg-surface-light space-y-4 rounded-md border p-4">
        <TabsSkeleton count={2} />
        <Skeleton className="h-10 w-72 max-w-full" />
        <TicketRowsSkeleton />
      </div>
    </Loading>
  );
}

/** Organizer's "my events" list: header, tabs, card grid. */
export function MyOrganizedEventsSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <Loading label="Loading your events…" className="mt-10 space-y-6">
      <PageHeaderSkeleton action />
      <TabsSkeleton count={4} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="border-border-light bg-surface-light flex flex-col overflow-hidden rounded-xl border"
          >
            <Skeleton className="aspect-[16/7] w-full rounded-none" />
            <div className="space-y-3 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** Organizer's single-event dashboard: summary card, tabs, content. */
export function ManageEventSkeleton() {
  return (
    <Loading label="Loading event…" className="mt-10 space-y-6">
      <Skeleton className="h-4 w-44" />
      <div className="border-border-light bg-surface-light rounded-md border p-5">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="flex gap-6">
            <Skeleton className="h-12 w-16" />
            <Skeleton className="h-12 w-16" />
          </div>
        </div>
        <div className="border-border-light mt-4 flex gap-2 border-t pt-4">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <TabsSkeleton count={6} />
      <StatTilesSkeleton />
      <div className="border-border-light bg-surface-light space-y-4 rounded-md border p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    </Loading>
  );
}

/** Create / edit event editor: action bar, tabs, form beside preview. */
export function EditorSkeleton() {
  return (
    <Loading label="Loading editor…" className="space-y-6 pt-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-1/2" />
        </div>
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-11 w-32" />
      </div>
      <TabsSkeleton count={8} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border-border-light bg-surface-light space-y-6 rounded-lg border p-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
          </div>
          <FormSkeleton fields={4} />
        </div>
        <div className="border-border-light bg-surface-light space-y-4 rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-8 w-40 rounded-full" />
          <Skeleton className="aspect-[3/2] w-full" />
        </div>
      </div>
    </Loading>
  );
}

/** Small centred card: invite, rating link, registration lookups. */
export function CenteredCardSkeleton({
  label = "Loading…",
}: {
  label?: string;
}) {
  return (
    <Loading label={label} className="mx-auto mt-16 w-full max-w-md px-4">
      <div className="border-border-light bg-surface-light space-y-5 rounded-lg border p-6">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </Loading>
  );
}

/** Wider two-column page used by registration lookups and judge tools. */
export function FormPageSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <Loading label={label} className="mx-auto mt-10 max-w-3xl space-y-6">
      <PageHeaderSkeleton />
      <div className="border-border-light bg-surface-light space-y-6 rounded-lg border p-6">
        <FormSkeleton fields={4} />
        <Skeleton className="h-11 w-40" />
      </div>
    </Loading>
  );
}

/** Profile page: avatar header + sections. */
export function ProfileSkeleton() {
  return (
    <Loading
      label="Loading profile…"
      className="mx-auto mt-10 max-w-3xl space-y-6"
    >
      <div className="border-border-light bg-surface-light flex items-center gap-5 rounded-lg border p-6">
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64 max-w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </div>
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="border-border-light bg-surface-light space-y-4 rounded-lg border p-6"
        >
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </Loading>
  );
}

/** Live scoreboard: performer card + score blocks. */
export function ScoreboardSkeleton() {
  return (
    <Loading
      label="Loading scoreboard…"
      className="mx-auto mt-10 max-w-4xl space-y-6"
    >
      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-8 w-72 max-w-full" />
        <Skeleton className="mx-auto h-4 w-48" />
      </div>
      <div className="border-border-light bg-surface-light space-y-5 rounded-lg border p-8">
        <Skeleton className="mx-auto size-24 rounded-full" />
        <Skeleton className="mx-auto h-7 w-56" />
        <Skeleton className="mx-auto h-4 w-40" />
        <div className="grid grid-cols-3 gap-4 pt-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    </Loading>
  );
}

/** Generic whole-page fallback (session checks, route transitions). */
export function PageSkeleton() {
  return (
    <Loading label="Loading…" className="mt-10 space-y-6">
      <PageHeaderSkeleton />
      <div className="border-border-light bg-surface-light space-y-4 rounded-md border p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </Loading>
  );
}
