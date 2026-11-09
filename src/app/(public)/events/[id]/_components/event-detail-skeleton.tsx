import { Skeleton } from "@/components/atoms";

// Mirrors the real page's layout (8:3 banner + title in the main column,
// sticky booking card beside it) so nothing jumps once data arrives.
export function EventDetailSkeleton() {
  return (
    <div className="flex flex-col gap-8 pb-16 lg:-mt-4">
      <Skeleton className="aspect-[3/1] w-full rounded-sm" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
          </div>
        </div>

        <div className="border-border-light bg-surface-light h-fit space-y-5 rounded-lg border p-6">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </div>
  );
}
