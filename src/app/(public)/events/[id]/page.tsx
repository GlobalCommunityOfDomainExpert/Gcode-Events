"use client";

import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  User,
  Compass,
  Sparkles,
  Tag,
  Ticket,
} from "lucide-react";
import { Button, Icon, SectionLabel } from "@/components/atoms";
import {
  Banner,
  Breadcrumb,
  EventBadgeRow,
  NotFoundState,
  SelectableCard,
} from "@/components/molecules";
import { Timeline } from "@/components/molecules";
import { getEventColor } from "@/lib/event-color";
import {
  eventTypeTone,
  Event,
  EventTimelineItem,
  hasEventEnded,
} from "@/lib/event";
import { useEvent } from "@/hooks/use-event";
import { useServerNow } from "@/hooks/use-server-now";
import { ShareEventCard } from "./_components/share-event-card";
import { EventHero } from "./_components/event-hero";
import { EventOverviewCard } from "./_components/event-overview-card";
import { EventDetailsCard } from "./_components/event-details-card";
import { EventAgendaCard } from "./_components/event-agenda-card";
import { OrganizerCard } from "./_components/organizer-card";
import { EventLinksCard } from "./_components/event-links-card";
import { EligibilityTermsCard } from "./_components/eligibility-terms-card";
import { RegistrationCard } from "./_components/registration-card";
import { InterestButton } from "./_components/interest-button";
import { EventInfoCard } from "./_components/event-info-card";
import { DetailItem } from "./_components/detail-item";
import {
  daysUntil,
  groupByDay,
  resolveDisplayTime,
  to12Hour,
} from "./_components/format";
import { EventDetailSkeleton } from "./_components/event-detail-skeleton";

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { event, status, refresh } = useEvent(params.id);
  const now = useServerNow();

  if (status === "loading") {
    return <EventDetailSkeleton />;
  }

  if (!event) {
    return (
      <NotFoundState
        icon={Compass}
        title="Event not found"
        description="This event may not exist, or it couldn't be loaded."
        actionHref="/events"
        actionLabel="Browse Events"
      />
    );
  }

  const isPast = hasEventEnded(event, now);

  // Rendered twice: inline right after the header on mobile (so price/CTA
  // isn't buried below the full details/agenda/eligibility scroll), and in
  // the sticky sidebar on desktop. Same node, two responsive placements.
  const bookingCard = (
    <div className="border-border-light bg-surface-light space-y-4 rounded-md border p-4">
      {(() => {
        // "enabled" (organizer offers this pass at all) is separate
        // from "open right now" (within its own registration window) —
        // an enabled-but-not-yet-open or enabled-but-closed pass still
        // shows up here, just greyed out, instead of disappearing.
        const enabledPasses = [
          {
            category: "PARTICIPANT" as const,
            data: event.participantRegistration,
          },

          {
            category: "ATTENDEE" as const,
            data: event.attendeeRegistration,
          },
        ].filter((p) => p.data.enabled);
        const registrationClosed = enabledPasses.length === 0;
        const singlePass =
          enabledPasses.length === 1 ? enabledPasses[0].data : undefined;
        const singleCategory =
          enabledPasses.length === 1 ? enabledPasses[0].category : undefined;

        function displayedCountLabel(
          category: "ATTENDEE" | "PARTICIPANT",
          registeredCount: number,
        ) {
          return category === "ATTENDEE"
            ? `${registeredCount} already booked`
            : `${registeredCount} registered`;
        }

        type WindowStatus =
          | { state: "not-open-yet"; days: number }
          | { state: "closed" }
          | { state: "closing-soon"; days: number }
          | { state: "open" };

        function windowStatus(
          data: Event["attendeeRegistration"],
        ): WindowStatus {
          const opensDays = daysUntil(data.registrationOpensIso);
          if (opensDays !== null && opensDays > 0) {
            return { state: "not-open-yet", days: opensDays };
          }
          const closesDays = daysUntil(data.registrationDeadlineIso);
          if (closesDays !== null) {
            return closesDays <= 0
              ? { state: "closed" }
              : { state: "closing-soon", days: closesDays };
          }
          return { state: "open" };
        }

        function windowStatusMeta(status: WindowStatus): string | undefined {
          if (status.state === "not-open-yet")
            return `opens in ${status.days}d`;
          if (status.state === "closed") return "closed";
          if (status.state === "closing-soon")
            return `closes in ${status.days}d`;
          return undefined;
        }

        const categoryIcon = { PARTICIPANT: User, ATTENDEE: Users } as const;
        const firstOpenCategory = enabledPasses.find(
          ({ data }) => windowStatus(data).state === "open",
        )?.category;

        return (
          <>
            {enabledPasses.length > 0 && (
              <>
                {enabledPasses.length > 1 && (
                  <p className="text-body text-text-primary flex items-center gap-2 font-semibold">
                    <Icon icon={Sparkles} size="sm" className="text-primary" />
                    How would you like to join?
                  </p>
                )}
                <div className="space-y-3">
                  {enabledPasses.map(({ category, data }) => {
                    const status = windowStatus(data);
                    const notOpenYet = status.state === "not-open-yet";
                    const closed = status.state === "closed";
                    return (
                      <SelectableCard
                        key={category}
                        layout="horizontal"
                        icon={categoryIcon[category]}
                        title={data.label}
                        subtitle={data.description || undefined}
                        selected={category === firstOpenCategory}
                        disabled={notOpenYet || closed}
                        statusLabel={
                          notOpenYet || closed
                            ? windowStatusMeta(status)
                            : undefined
                        }
                        lockMessage={
                          notOpenYet
                            ? `${data.label} registration unlocks in ${status.days} day${status.days === 1 ? "" : "s"}`
                            : closed
                              ? `${data.label} registration is closed`
                              : undefined
                        }
                        metaItems={[
                          {
                            icon: Tag,
                            label: data.priceLabel,
                            tone: "success" as const,
                          },
                          !notOpenYet && !closed
                            ? {
                                icon: Ticket,
                                label: displayedCountLabel(
                                  category,
                                  data.registeredCount,
                                ),
                                tone: "warning" as const,
                                bordered: true,
                              }
                            : undefined,
                          status.state === "closing-soon"
                            ? {
                                icon: Clock,
                                label: windowStatusMeta(status)!,
                                tone: "warning" as const,
                              }
                            : undefined,
                        ].filter(
                          (item): item is NonNullable<typeof item> =>
                            item !== undefined,
                        )}
                        onSelect={() =>
                          router.push(
                            `/events/${event.id}/register?category=${category}`,
                          )
                        }
                      />
                    );
                  })}
                </div>
              </>
            )}
            {event.status !== "CANCELLED" && !isPast && (
              <>
                <InterestButton
                  eventId={event.id}
                  onInterested={() => void refresh({ silent: true })}
                />
                {(event.interestedCount ?? 0) > 0 && (
                  <p className="text-small text-text-secondary text-center">
                    {event.interestedCount} interested
                  </p>
                )}
              </>
            )}
            {event.status === "CANCELLED" ? (
              <Button variant="secondary" className="w-full" disabled>
                Event Cancelled
              </Button>
            ) : isPast ? (
              <Button variant="secondary" className="w-full" disabled>
                Event Ended
              </Button>
            ) : registrationClosed ? (
              <Button variant="secondary" className="w-full" disabled>
                Registration Closed
              </Button>
            ) : null}
            {singlePass?.capacity && (
              <p className="text-small text-text-secondary text-center">
                {singlePass.capacity} total capacity ·{" "}
                {displayedCountLabel(
                  singleCategory!,
                  singlePass.registeredCount,
                )}
              </p>
            )}
          </>
        );
      })()}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Breadcrumb
          items={[
            { label: "Events", href: "/events" },
            { label: event.type, href: "/events" },
            { label: event.title },
          ]}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.back()}
          className="shrink-0"
        >
          <Icon icon={ArrowLeft} size="sm" /> Back
        </Button>
      </div>

      {event.status === "CANCELLED" && (
        <Banner tone="danger">
          This event has been cancelled by the organizer.
        </Banner>
      )}
      {isPast && event.status !== "CANCELLED" && (
        <Banner tone="info">This event has ended.</Banner>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div
            className={`relative flex aspect-8/3 items-end overflow-hidden rounded-md p-4 ${isPast ? "grayscale" : ""}`}
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
          </div>

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

          <div className="lg:hidden">
            <ShareEventCard
              url={`${typeof window !== "undefined" ? window.location.origin : ""}/events/${event.id}`}
              title={event.title}
            />
          </div>

          <div className="lg:hidden">{bookingCard}</div>

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

          {event.timeline.length > 0 && (
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
          )}

          {event.socialLinks && event.socialLinks.length > 0 && (
            <EventLinksCard links={event.socialLinks} />
          )}

          <div className="border-border-light bg-surface-light space-y-4 rounded-md border p-6">
            <div className="space-y-2">
              <SectionLabel>Eligibility</SectionLabel>
              <ul className="text-body text-text-secondary list-disc space-y-1.5 pl-5">
                {event.eligibility.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <SectionLabel>Terms &amp; Conditions</SectionLabel>
              <ul className="text-body text-text-secondary list-disc space-y-1.5 pl-5">
                {event.terms.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-primary space-y-3 rounded-md p-6">
            <p className="text-small font-bold tracking-widest text-white/70 uppercase">
              The GCODE Talent Ethos
            </p>
            <img
              src="/app-logo.png"
              alt="GCODE"
              className="h-10 w-auto object-contain"
            />
            <p className="text-body font-semibold text-white/90">
              Discover. Perform. Connect. Grow.
            </p>
            <p className="text-body text-white/80">
              At GCODE, we believe talent is just the beginning. Every
              performance is an opportunity to build confidence, every
              interaction is a chance to create meaningful connections, and
              every event opens doors to new opportunities.
            </p>
            <p className="text-body text-white/80">
              We provide a professional platform where individuals can showcase
              their talent, receive valuable recognition, learn from experienced
              mentors, connect with like-minded people, and become part of a
              thriving ecosystem that celebrates passion, creativity and
              continuous growth.
            </p>
            <p className="text-body text-white/80">
              Because at GCODE, talent doesn&apos;t end with applause—it begins
              with opportunity.
            </p>
          </div>
        </div>

        <div className="hidden space-y-6 lg:sticky lg:top-6 lg:block lg:self-start">
          {bookingCard}
          <ShareEventCard
            url={`${typeof window !== "undefined" ? window.location.origin : ""}/events/${event.id}`}
            title={event.title}
          />
        </div>
      </div>
    </div>
  );
}
