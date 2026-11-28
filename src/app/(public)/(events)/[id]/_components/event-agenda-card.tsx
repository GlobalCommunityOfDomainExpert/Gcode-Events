import { SectionLabel } from "@/components/atoms";
import { Timeline } from "@/components/molecules";
import { Event } from "@/lib/event";
import { groupByDay, to12Hour } from "./format";

export function EventAgendaCard({ event }: { event: Event }) {
  if (event.timeline.length === 0) return null;

  return (
    <div className="border-border-light bg-surface-light space-y-5 rounded-md border p-6">
      <SectionLabel>Agenda</SectionLabel>
      {groupByDay(event.timeline).map((group, groupIndex) => (
        <div key={group.day} className="space-y-3">
          {group.label && (
            <div className="flex items-center gap-3">
              <span className="text-small text-text-primary font-semibold">
                {group.label}
              </span>
              <span className="bg-border-light h-px flex-1" />
            </div>
          )}
          <Timeline
            items={group.items.map((item, index) => ({
              time: item.endTime
                ? `${to12Hour(item.time)} – ${to12Hour(item.endTime)}`
                : to12Hour(item.time),
              title: item.title,
              location: item.location,
              description: item.description,
              active: groupIndex === 0 && index === 0,
            }))}
          />
        </div>
      ))}
    </div>
  );
}
