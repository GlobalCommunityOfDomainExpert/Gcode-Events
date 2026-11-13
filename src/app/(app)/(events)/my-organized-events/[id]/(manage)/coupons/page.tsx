"use client";

import { CouponsTab } from "../../_components/coupons-tab";
import { useOrganizedEvent } from "../../_components/event-context";

export default function CouponsPage() {
  const { event } = useOrganizedEvent();
  return <CouponsTab eventId={event.id} />;
}
