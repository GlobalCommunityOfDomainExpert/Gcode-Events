import { Button, ButtonLink } from "@/components/atoms";
import { AvatarGroup, AvatarGroupItem } from "@/components/molecules";
import { Event } from "@/lib/event";
import { daysUntil } from "./format";

export function RegistrationCard({
  event,
  attendees,
}: {
  event: Event;
  attendees: AvatarGroupItem[];
}) {
  const days = daysUntil(event.registrationDeadlineIso);

  return (
    <div className="border-border-light bg-surface-light space-y-4 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <span className="text-heading text-text-primary font-extrabold">
          {event.price}
        </span>
        {event.spotsLeft !== undefined && (
          <span className="text-small text-warning font-semibold">
            {event.spotsLeft} spots left
          </span>
        )}
      </div>
      {days !== null && (
        <p className="text-small text-text-secondary">
          {days <= 0
            ? "Registration closed"
            : `Registration closes in ${days} day${days === 1 ? "" : "s"}`}
        </p>
      )}
      {attendees.length > 0 && (
        <AvatarGroup
          items={attendees}
          overflowLabel={`+${event.registeredCount} already registered`}
        />
      )}
      {event.status === "CANCELLED" ? (
        <Button variant="secondary" className="w-full" disabled>
          Event Cancelled
        </Button>
      ) : (
        <ButtonLink
          href={`/${event.id}/register`}
          variant="primary"
          className="w-full"
        >
          Book Tickets
        </ButtonLink>
      )}
      {event.capacity && (
        <p className="text-small text-text-secondary text-center">
          {event.capacity} total capacity · {event.registeredCount} registered
        </p>
      )}
    </div>
  );
}
