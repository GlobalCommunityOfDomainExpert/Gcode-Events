import { SectionLabel } from "@/components/atoms";
import { EventBadgeRow } from "@/components/molecules";
import { eventTypeTone, Event } from "@/lib/event";

export function EventOverviewCard({ event }: { event: Event }) {
  return (
    <div className="border-border-light bg-surface-light space-y-3 rounded-md border p-6">
      <h1 className="text-heading text-text-primary font-extrabold">
        {event.title}
      </h1>
      <EventBadgeRow
        type={event.type}
        mode={event.mode}
        price={event.price}
        typeTone={eventTypeTone(event.type)}
      />
      <div className="border-border-light space-y-2 border-t pt-4">
        <SectionLabel>About this event</SectionLabel>
        {event.description.map((paragraph, index) => (
          <p key={index} className="text-body text-text-secondary">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}
