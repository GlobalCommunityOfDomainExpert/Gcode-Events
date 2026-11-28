import { Skeleton } from "@/components/atoms";

// Mirrors the register page's main layout (breadcrumb, heading, form card,
// checkout summary) so the loading state doesn't jump once the event arrives.
export function RegisterSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Skeleton className="h-5 w-72" />

      <div className="space-y-1">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-56" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="border-border-light bg-surface-light space-y-4 rounded-md border p-6">
            <Skeleton className="h-5 w-40" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          </div>
          <div className="border-border-light bg-surface-light rounded-md border p-6">
            <Skeleton className="h-5 w-full" />
          </div>
        </div>

        <div className="border-border-light bg-surface-light space-y-3 rounded-md border p-6">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
