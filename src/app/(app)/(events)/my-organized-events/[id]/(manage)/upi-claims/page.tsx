"use client";

import { UpiClaimsTab } from "../../_components/upi-claims-tab";
import { useOrganizedEvent } from "../../_components/event-context";

export default function UpiClaimsPage() {
  const { event } = useOrganizedEvent();
  return <UpiClaimsTab eventId={event.id} />;
}
