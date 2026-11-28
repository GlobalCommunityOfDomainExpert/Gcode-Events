import { Skeleton } from "@/components/atoms";

// Mirrors the confirmation page's layout (breadcrumb, success banner, event
// card, ticket card) so the loading state doesn't jump once the ticket arrives.
export function RegisteredSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Skeleton className="h-5 w-72" />

      <div className="border-border-light bg-surface-light flex items-start gap-4 rounded-md border p-6">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      <div className="border-border-light bg-surface-light space-y-3 rounded-md border p-6">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-5 w-32 rounded-full" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/2" />
      </div>

      <div className="border-border-light bg-surface-light space-y-4 rounded-md border p-6">
        <Skeleton className="h-5 w-24" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-32 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
