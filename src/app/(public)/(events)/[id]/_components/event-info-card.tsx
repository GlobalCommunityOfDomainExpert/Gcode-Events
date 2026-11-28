import { Award, Calendar, MapPin } from "lucide-react";
import { SectionLabel } from "@/components/atoms";
import { Event } from "@/lib/event";
import { DetailItem } from "./detail-item";
import { resolveDisplayTime } from "./format";

export function EventInfoCard({ event }: { event: Event }) {
  return (
    <div className="border-border-light bg-surface-light space-y-3 rounded-md border p-4">
      <SectionLabel>Event Info</SectionLabel>
      <div className="space-y-3">
        <DetailItem
          icon={Calendar}
          label=""
          value={event.date}
          description={resolveDisplayTime(event)}
        />
        <DetailItem
          icon={MapPin}
          label=""
          value={event.location}
          description={event.mode}
        />
        {event.certificate && (
          <DetailItem
            icon={Award}
            label=""
            value="Certificate"
            description="Issued on completion"
          />
        )}
      </div>
    </div>
  );
}
