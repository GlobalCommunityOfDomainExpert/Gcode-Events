"use client";

import { Suspense } from "react";
import { CouponsTab } from "../../_components/coupons-tab";
import { useOrganizedEvent } from "../../_components/event-context";

export default function CouponsPage() {
  const { event } = useOrganizedEvent();
  // CouponsTab reads ?new=1 with useSearchParams, which needs a boundary.
  return (
    <Suspense fallback={null}>
      <CouponsTab eventId={event.id} />
    </Suspense>
  );
}
