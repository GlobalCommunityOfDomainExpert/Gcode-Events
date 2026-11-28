import { Badge } from "@/components/atoms";
import { getEventColor } from "@/lib/event-color";
import { Event } from "@/lib/event";

export function EventHero({ event }: { event: Event }) {
  return (
    <div
      className="relative flex aspect-3/1 items-end overflow-hidden rounded-md p-4"
      style={
        event.coverImageUrl
          ? undefined
          : { backgroundColor: getEventColor(event.id) }
      }
    >
      {event.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.coverImageUrl}
          alt={event.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="relative flex flex-wrap gap-2">
        <Badge variant="solid" tone="neutral">
          {event.type}
        </Badge>
        <Badge variant="solid" tone="neutral">
          {event.mode}
        </Badge>
        <Badge variant="solid" tone="success">
          {event.price}
        </Badge>
      </div>
      {event.is_featured && (
        <Badge
          variant="solid"
          tone="warning"
          className="absolute top-4 right-4"
        >
          Featured
        </Badge>
      )}
    </div>
  );
}
