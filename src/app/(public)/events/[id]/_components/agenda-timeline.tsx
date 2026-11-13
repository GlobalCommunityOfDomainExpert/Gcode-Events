import { MapPin, Video } from "lucide-react";
import { Icon } from "@/components/atoms";
import type { EventTimelineItem } from "@/lib/event";
import { to12Hour } from "./format";

// Times on the left, a connecting rail, sessions on the right.
export function AgendaTimeline({ items }: { items: EventTimelineItem[] }) {
  return (
    <ol>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <li
            key={`${item.title}-${index}`}
            className="grid grid-cols-[4.75rem_1.25rem_minmax(0,1fr)] gap-x-3"
          >
            <div className="pt-0.5 text-right">
              <p className="text-small text-text-primary font-semibold tabular-nums">
                {to12Hour(item.time)}
              </p>
              {item.endTime && (
                <p className="text-text-secondary text-xs tabular-nums">
                  {to12Hour(item.endTime)}
                </p>
              )}
            </div>
            <div className="flex flex-col items-center">
              <span
                className={`mt-1.5 size-2.5 shrink-0 rounded-full ${index === 0 ? "bg-secondary ring-secondary-light ring-4" : "bg-border-hover"}`}
              />
              {!last && <span className="bg-border-light mt-1 w-px flex-1" />}
            </div>
            <div className={last ? "" : "pb-6"}>
              <p className="text-body text-text-primary font-semibold">
                {item.title}
              </p>
              {item.description && (
                <p className="text-small text-text-secondary mt-0.5">
                  {item.description}
                </p>
              )}
              {item.location && (
                <p className="text-text-secondary mt-1.5 inline-flex items-center gap-1 text-xs font-medium">
                  <Icon
                    icon={/^online\b/i.test(item.location) ? Video : MapPin}
                    size="sm"
                    className="size-3.5"
                  />
                  {item.location}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
