import { Calendar, Clock, MapPin, Users } from "lucide-react";
import { SectionLabel } from "@/components/atoms";
import { Event } from "@/lib/event";
import { DetailItem } from "./detail-item";
import { resolveDisplayTime } from "./format";

export function EventDetailsCard({ event }: { event: Event }) {
  return (
    <div className="border-border-light bg-surface-light space-y-4 rounded-md border p-6">
      <SectionLabel>Event Details</SectionLabel>
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailItem
          icon={Calendar}
          label="Date & Time"
          value={event.date}
          description={resolveDisplayTime(event)}
        />
        <DetailItem
          icon={Clock}
          label="Duration"
          value={event.duration || event.durationText || "TBD"}
          description=""
        />
        <DetailItem
          icon={MapPin}
          label="Venue"
          value={event.location}
          description={event.mode}
        />
        <DetailItem
          icon={Users}
          label="Team Size"
          value={event.teamSize}
          description=""
        />
      </div>
    </div>
  );
}
