"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Compass, Info } from "lucide-react";
import { Button, Icon } from "@/components/atoms";
import { NotFoundState } from "@/components/molecules";
import { useEvent } from "@/hooks/use-event";
import { useServerNow } from "@/hooks/use-server-now";
import { ShareEventCard } from "./_components/share-event-card";
import { EventLinksCard } from "./_components/event-links-card";
import { InterestButton } from "./_components/interest-button";
import { EventEnquiryButton } from "./_components/event-enquiry-button";
import { EventDetailSkeleton } from "./_components/event-detail-skeleton";
import { OrganizerBar } from "./_components/organizer-bar";
import { LiveRoomCard } from "./_components/live-room-card";
import {
  AboutSection,
  EventCover,
  EventHeading,
  PartnersStrip,
  EventPills,
  HostCard,
  EthosSection,
  FaqSection,
  LocationSection,
  MediaSection,
  PrimaryCta,
  ScheduleSection,
  TermsSection,
  TicketsCard,
  WhoSection,
  getEventState,
} from "./_components/event-sections";

// Smooth-scrolls to the pass picker every time (a plain #hash link only
// jumps once, and not at all when the hash is already set).
function scrollToTickets() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById("tickets")
    ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromRegister = searchParams.get("from") === "register";
  const returnCategory = searchParams.get("category");
  const { event, status, refresh } = useEvent(params.id);
  const now = useServerNow();

  if (status === "loading") {
    return <EventDetailSkeleton />;
  }

  if (!event) {
    return (
      <div className="pt-28">
        <NotFoundState
          icon={Compass}
          title="Event not found"
          description="This event may not exist, or it couldn't be loaded."
          actionHref="/"
          actionLabel="Browse Events"
        />
      </div>
    );
  }

  const state = getEventState(event, now);
  const { isLive, isCancelled, weekday, dateLabel, venueName } = state;
  // More than one pass on sale: the phone bar sends people to the picker.
  const choosePass =
    isLive && !state.ctaDisabledLabel && state.enabledPasses.length > 1;

  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/events/${event.id}`;
  const interestButtonNode = isLive ? (
    <InterestButton
      eventId={event.id}
      interestedCount={event.interestedCount}
      onInterested={() => void refresh({ silent: true })}
      plain
    />
  ) : undefined;
  const tellMeMoreButtonNode = isLive ? (
    <EventEnquiryButton
      eventId={event.id}
      eventTitle={event.title}
      faqs={event.faqs}
      plain
    />
  ) : undefined;

  function goBack() {
    if (fromRegister) {
      router.push(
        `/events/${event!.id}/register${
          returnCategory === "ATTENDEE" || returnCategory === "PARTICIPANT"
            ? `?category=${returnCategory}`
            : ""
        }`,
      );
    } else {
      router.back();
    }
  }

  return (
    <div className="flex flex-col gap-8 pb-28 lg:-mt-4 lg:pb-16">
      <OrganizerBar event={event} />
      <EventCover event={event} state={state} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
        <main className="flex min-w-0 flex-col gap-8">
          {/* ---------------------------------------------------- intro */}
          <div>
            {/* Back lives inline with the pills — the type pill already
                names the category, so a separate breadcrumb row would only
                push the content down. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={goBack}
                  className="text-small text-text-secondary hover:text-text-primary -ml-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 font-medium transition-colors"
                >
                  <Icon icon={ArrowLeft} size="sm" /> Back
                </button>
                <span aria-hidden className="bg-border-hover h-4 w-px" />
                <EventPills event={event} state={state} />
              </div>

              {isLive && (
                <div className="-mr-2 shrink-0">
                  <ShareEventCard
                    bare
                    plain
                    url={shareUrl}
                    title={event.title}
                    dateLabel={dateLabel}
                    place={event.mode === "Online" ? "Online" : venueName}
                    imageUrl={event.coverImageUrl}
                    tellMeMoreButton={tellMeMoreButtonNode}
                    interestButton={interestButtonNode}
                  />
                </div>
              )}
            </div>

            <EventHeading event={event} state={state} className="mt-6" />
            {/* Phones show partners in the booking bar instead. */}
            <div className="hidden lg:block">
              <PartnersStrip event={event} className="mt-5" />
            </div>
          </div>

          <AboutSection event={event} />
          <MediaSection event={event} />
          <ScheduleSection event={event} />
          <LocationSection event={event} state={state} />
          <WhoSection event={event} />
          <TermsSection event={event} />
          <FaqSection event={event} />

          {event.socialLinks && event.socialLinks.length > 0 && (
            <EventLinksCard links={event.socialLinks} />
          )}

          <EthosSection event={event} />
        </main>

        {/* --------------------------------------------------------- sidebar */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <TicketsCard event={event} state={state} />
          {isLive && <LiveRoomCard event={event} />}
          <HostCard event={event} />

          {!isLive && (
            <p className="text-small text-text-secondary flex items-start gap-2 px-1">
              <Icon icon={Info} size="sm" className="mt-0.5 shrink-0" />
              {isCancelled
                ? "This event was cancelled by the organizer."
                : "This event has ended. Browse upcoming events to find your next one."}
            </p>
          )}
        </aside>
      </div>

      {/* ---------------------------------------------- mobile booking bar */}
      <div className="border-border-light bg-surface-light/90 fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 shadow-lg backdrop-blur-xl lg:hidden">
        <div className="mx-auto max-w-xl">
          <PartnersStrip
            event={event}
            compact
            className="border-border-light mb-2 border-b pb-2"
          />
        </div>
        <div className="mx-auto flex max-w-xl items-center gap-4">
          <div className="min-w-0">
            <p className="text-large text-text-primary leading-tight font-extrabold">
              {choosePass ? "Choose your pass" : state.priceLabel}
            </p>
            <p className="text-small text-text-secondary truncate">
              {weekday ? `${weekday.slice(0, 3)}, ${event.date}` : event.date}
            </p>
          </div>
          <div className="ml-auto w-44 shrink-0">
            {choosePass ? (
              // Several passes: the price would be only the first one, so the
              // button leads to the pass picker instead of one registration.
              <Button
                type="button"
                variant="accent"
                className="w-full"
                onClick={scrollToTickets}
              >
                Get Tickets <Icon icon={ArrowRight} size="sm" />
              </Button>
            ) : (
              <PrimaryCta state={state} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
