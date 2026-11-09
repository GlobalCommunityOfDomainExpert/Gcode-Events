"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Calendar,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  GraduationCap,
  Gift,
  Globe,
  LayoutGrid,
  MapPin,
  Rocket,
  SearchX,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge, Button, ButtonLink, Icon } from "@/components/atoms";
import {
  Chip,
  EmptyState,
  EventCard,
  EventCardSkeleton,
  SearchBar,
} from "@/components/molecules";
import {
  Event,
  formatTimeRange,
  formatWeekday,
  hasEventEnded,
  priceTone,
} from "@/lib/event";
import { useEvent } from "@/hooks/use-event";
import { useEvents } from "@/hooks/use-events";
import { useLookup } from "@/hooks/use-lookup";
import { useServerNow } from "@/hooks/use-server-now";
import { getEventTypes } from "@/lib/api/lookups";

// Shared props for the "default" EventCard in the Upcoming and Past grids.
function defaultCardProps(event: Event) {
  const attendeeCount = event.registeredCount;
  return {
    href: `/events/${event.id}`,
    actionHref:
      event.status === "OPEN" || event.status === undefined
        ? `/events/${event.id}/register`
        : undefined,
    imageSrc: event.coverImageUrl,
    colorSeed: event.id,
    tags: [
      { label: event.type, tone: "primary" as const },
      { label: event.price, tone: priceTone(event.price) },
    ],
    title: event.title,
    date: event.date,
    dateDetail: formatWeekday(event.startDateIso),
    time: formatTimeRange(event.startDateIso, null),
    location: event.mode === "Online" ? "Online event" : event.location,
    eventType: event.type,
    durationText: event.duration || undefined,
    spotsLeft: event.spotsLeft,
    attendeesLabel: attendeeCount ? `${attendeeCount} attending` : undefined,
  };
}

const filterChips = [
  { value: "All", label: "All", icon: LayoutGrid },
  { value: "Free", label: "Free", icon: Gift },
  { value: "Paid", label: "Paid", icon: CreditCard },
  { value: "Online", label: "Online", icon: Globe },
  { value: "In-Person", label: "In-Person", icon: MapPin },
] as const;

const whyJoinItems = [
  {
    icon: GraduationCap,
    title: "Learn",
    description: "Gain knowledge from industry experts",
  },
  {
    icon: Users,
    title: "Connect",
    description: "Network with like-minded professionals",
  },
  {
    icon: TrendingUp,
    title: "Grow",
    description: "Upskill and advance your career",
  },
  {
    icon: Rocket,
    title: "Build",
    description: "Work on real challenges and build solutions",
  },
] as const;

const FEATURED_ROTATE_MS = 6000;
const PAST_EVENTS_INITIAL_COUNT = 6;
const PAST_EVENTS_LOAD_MORE_COUNT = 9;

export default function EventsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const filterSentinelRef = useRef<HTMLDivElement>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const filterTabsRef = useRef<HTMLDivElement>(null);
  const filterChipsRef = useRef<HTMLDivElement>(null);
  const filterChipsYRef = useRef<HTMLDivElement>(null);
  const filterDividerRef = useRef<HTMLDivElement>(null);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [featuredPaused, setFeaturedPaused] = useState(false);
  const [pastVisibleCount, setPastVisibleCount] = useState(
    PAST_EVENTS_INITIAL_COUNT,
  );
  const { events, status } = useEvents();
  const { data: eventTypes } = useLookup(getEventTypes);
  const now = useServerNow();

  const categoryTabs = [
    { value: "all", label: "All" },
    ...eventTypes.map((type) => ({ value: type.name, label: type.name })),
  ];

  // Switching categories should read from the top, not leave the visitor
  // stranded mid-scroll in whatever list they were looking at before.
  function handleTabChange(value: string) {
    setActiveTab(value);
    setPastVisibleCount(PAST_EVENTS_INITIAL_COUNT);
    document
      .getElementById("app-scroll-region")
      ?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleFilter(filter: string) {
    setActiveFilters((prev) =>
      prev.includes(filter)
        ? prev.filter((f) => f !== filter)
        : [...prev, filter],
    );
  }

  // Drafts aren't public yet — organizers still see them under
  // /my-organized-events.
  const visibleEvents = events.filter((event) => event.status !== "DRAFT");

  function matchesFilters(event: (typeof visibleEvents)[number]) {
    if (activeTab !== "all" && event.type !== activeTab) return false;

    // Chips within the same facet (price: Free/Paid, mode: Online/In-Person)
    // are OR'd together — selecting both Free and Paid should show either,
    // not neither (the previous AND-everything logic made that combination
    // impossible to satisfy). Different facets still AND together.
    const priceFilters = activeFilters.filter(
      (f) => f === "Free" || f === "Paid",
    );
    if (
      priceFilters.length > 0 &&
      !priceFilters.some((f) =>
        f === "Free" ? event.price === "Free" : event.price !== "Free",
      )
    )
      return false;

    const modeFilters = activeFilters.filter(
      (f) => f === "Online" || f === "In-Person",
    );
    if (modeFilters.length > 0 && !modeFilters.some((f) => f === event.mode))
      return false;

    if (
      search.trim() &&
      !event.title.toLowerCase().includes(search.trim().toLowerCase())
    )
      return false;
    return true;
  }

  const featured = visibleEvents
    .filter((event) => event.is_featured)
    .filter((event) => !hasEventEnded(event, now))
    .filter(matchesFilters);

  useEffect(() => {
    if (featured.length <= 1 || featuredPaused) return;
    const id = setInterval(() => {
      setFeaturedIndex((prev) => (prev + 1) % featured.length);
    }, FEATURED_ROTATE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featured.length, featuredPaused]);

  // One filter bar that morphs in place when it pins under the navbar.
  // Scroll only decides WHICH state we're in (expanded vs compact); the
  // change itself is a time-based CSS transition (~550ms), so it always
  // completes smoothly and never freezes half-way when scrolling stops.
  //   • chips don't travel: they sink + fade out where they are, are moved
  //     to their new spot while invisible, then rise straight up into place
  //     as the transition finishes
  //   • active tab blends red underline → navy pill via the registered,
  //     animatable --p custom property (see globals.css)
  //   • padding / height shrink; lost height is returned as margin-bottom
  //     on the same curve, so the content below never moves
  useEffect(() => {
    const region = document.getElementById("app-scroll-region") ?? window;
    const DURATION = 550;
    const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
    let frame = 0;
    let compact: boolean | null = null;
    let chipTimer = 0;
    let lastBarW = 0;
    let metrics: {
      barW: number;
      tabsH: number;
      chipsW: number;
      chipsH: number;
      inline: boolean;
    } | null = null;

    function measure() {
      const bar = filterBarRef.current;
      const tabs = filterTabsRef.current;
      const chipsRow = filterChipsYRef.current;
      if (!bar || !tabs || !chipsRow) return null;
      const barW = bar.clientWidth;
      // Sum of chip widths + gaps — independent of current layout.
      const chipEls = Array.from(chipsRow.children) as HTMLElement[];
      const naturalChipsW =
        chipEls.reduce((sum, el) => sum + el.offsetWidth, 0) +
        8 * Math.max(chipEls.length - 1, 0) +
        2;
      const tabsW = Math.min(tabs.scrollWidth, barW - 32);
      const inline = tabsW + 24 + naturalChipsW <= barW - 16;
      const chipsW = inline ? naturalChipsW : barW - 32;
      // Chips never wrap: one row, swipeable when it can't fit (phones).
      chipsRow.style.width = `${chipsW}px`;
      chipsRow.style.overflowX = inline ? "visible" : "auto";
      return {
        barW,
        tabsH: tabs.offsetHeight,
        chipsW,
        chipsH: chipsRow.offsetHeight,
        inline,
      };
    }

    function apply(next: boolean, animate: boolean) {
      const bar = filterBarRef.current;
      const chipsX = filterChipsRef.current;
      const chipsY = filterChipsYRef.current;
      const divider = filterDividerRef.current;
      if (!bar || !chipsX || !chipsY || !divider || !metrics) return;
      const { barW, tabsH, chipsW, chipsH, inline } = metrics;

      const pad = next ? 8 : 16;
      const h0 = 16 + tabsH + 16 + chipsH + 16;
      const x = next && inline ? barW - 8 - chipsW : pad;
      const y = next
        ? inline
          ? 8 + (tabsH - chipsH) / 2
          : 8 + tabsH + 8
        : 16 + tabsH + 16;
      const h = next
        ? inline
          ? 16 + Math.max(tabsH, chipsH)
          : 8 + tabsH + 8 + chipsH + 8
        : h0;

      const ms = animate ? DURATION : 0;
      const t = (props: string, dur: number, delay = 0) =>
        props
          .split(",")
          .map((p) => `${p.trim()} ${dur}ms ${EASE} ${delay}ms`)
          .join(", ");

      bar.style.transition = t("height, padding, margin-bottom, --p", ms);
      divider.style.transition = t("top, opacity", ms);

      bar.style.setProperty("--p", next ? "1" : "0");
      bar.style.padding = `${pad}px`;
      bar.style.height = `${h}px`;
      bar.style.marginBottom = `${h0 - h}px`;
      divider.style.top = `${pad + tabsH}px`;
      divider.style.opacity = next ? "0" : "1";

      // Chips: hide → reposition → rise. Inner layer is no longer used for
      // motion; the outer layer carries both position and the reveal.
      window.clearTimeout(chipTimer);
      chipsY.style.transform = "none";
      const place = (dy: number, opacity: number, dur: number) => {
        chipsX.style.transition = dur
          ? `transform ${dur}ms ${EASE}, opacity ${dur}ms ${EASE}`
          : "none";
        chipsX.style.transform = `translate(${x}px, ${y + dy}px)`;
        chipsX.style.opacity = String(opacity);
      };
      if (!ms) {
        place(0, 1, 0);
        return;
      }
      const OUT = Math.round(ms * 0.35); // sink + fade out in place
      const IN = Math.round(ms * 0.45); // rise into the new spot
      const current = chipsX.style.transform;
      chipsX.style.transition = `transform ${OUT}ms ${EASE}, opacity ${OUT}ms ${EASE}`;
      chipsX.style.transform = `${current} translateY(14px)`;
      chipsX.style.opacity = "0";
      chipTimer = window.setTimeout(() => {
        place(16, 0, 0); // jump (invisible) to just below the target
        void chipsX.offsetWidth; // commit before animating back in
        place(0, 1, IN);
      }, ms - IN);
    }

    function update() {
      frame = 0;
      const sentinel = filterSentinelRef.current;
      const bar = filterBarRef.current;
      if (!sentinel || !bar) return;
      const fresh = !metrics;
      metrics ??= measure();
      if (!metrics) return;
      const stickyTop = parseFloat(getComputedStyle(bar).top) || 0;
      const offset = stickyTop - sentinel.getBoundingClientRect().top;
      // Small hysteresis so tiny scroll jitter at the edge can't flip-flop.
      const next = compact ? offset > -8 : offset > 8;
      if (next !== compact || fresh) {
        apply(next, compact !== null && !fresh);
        compact = next;
      }
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    function remeasure() {
      metrics = null;
      schedule();
    }

    // Only width changes need a re-measure — the bar's own height animates.
    const observer = new ResizeObserver((entries) => {
      // Border-box width: the padding animation changes the content box,
      // which must not count as a resize (it would cancel the animation).
      const w = Math.round(
        entries[0]?.borderBoxSize?.[0]?.inlineSize ??
          filterBarRef.current?.offsetWidth ??
          0,
      );
      if (w && w !== lastBarW) {
        lastBarW = w;
        remeasure();
      }
    });
    if (filterBarRef.current) observer.observe(filterBarRef.current);
    const tabsObserver = new ResizeObserver(remeasure);
    if (filterTabsRef.current) tabsObserver.observe(filterTabsRef.current);
    update();
    document.fonts?.ready.then(remeasure);
    region.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", remeasure);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(chipTimer);
      observer.disconnect();
      tabsObserver.disconnect();
      region.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", remeasure);
    };
  }, []);

  const activeFeaturedIndex =
    featured.length === 0 ? 0 : featuredIndex % featured.length;
  const activeFeaturedEvent = featured[activeFeaturedIndex];

  // The list endpoint never returns a description (only populated on detail
  // fetch) — fetch it for whichever featured event is currently on screen so
  // the spotlight card can show a real one. Guarded against the id so a
  // stale previous-event description can't flash while the new one loads.
  const { event: activeFeaturedDetail } = useEvent(activeFeaturedEvent?.id);
  const featuredDescriptionLines =
    activeFeaturedEvent && activeFeaturedDetail?.id === activeFeaturedEvent.id
      ? activeFeaturedDetail.description
      : [];

  const filtered = visibleEvents.filter(matchesFilters);
  const upcomingFiltered = filtered.filter((e) => !hasEventEnded(e, now));
  const pastFiltered = filtered
    .filter((e) => hasEventEnded(e, now))
    .sort((a, b) => (b.endDateIso ?? "").localeCompare(a.endDateIso ?? ""));
  const visiblePast = pastFiltered.slice(0, pastVisibleCount);

  const hasActiveFilters =
    activeTab !== "all" || activeFilters.length > 0 || search.trim() !== "";

  function renderFilterChips() {
    return filterChips.map((chip) => {
      const selected =
        chip.value === "All"
          ? activeFilters.length === 0
          : activeFilters.includes(chip.value);
      return (
        <Chip
          key={chip.value}
          selected={selected}
          className="shrink-0"
          onClick={() =>
            chip.value === "All"
              ? setActiveFilters([])
              : toggleFilter(chip.value)
          }
        >
          <span className="inline-flex items-center gap-1.5">
            <Icon icon={chip.icon} size="sm" />
            {chip.label}
          </span>
        </Chip>
      );
    });
  }

  function clearAllFilters() {
    setActiveTab("all");
    setActiveFilters([]);
    setSearch("");
  }

  return (
    <div className="flex flex-col pb-16">
      {/* ------------------------------------------------------------ hero */}
      <div className="relative left-1/2 flex min-h-110 w-screen -translate-x-1/2 items-center overflow-hidden bg-black lg:min-h-135">
        <Image
          src="/banner-hero.png"
          alt=""
          fill
          className="hidden object-cover sm:block"
          priority
        />
        <div className="absolute inset-0 hidden bg-linear-to-r from-black/90 via-black/55 to-transparent sm:block" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-black/60 to-transparent" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-7 px-4 pt-28 pb-24 sm:px-6 lg:px-8 lg:pb-28">
          <div className="max-w-2xl">
            <h1 className="text-4xl leading-[1.1] font-extrabold text-white sm:text-5xl">
              Explore. Learn. Connect.
              <br />
              Power your growth with{" "}
              <span className="text-secondary">GCODE</span> Events
            </h1>
            <p className="mt-4 max-w-xl text-lg text-white/70">
              Hackathons, ideathons, expert AMAs and live webinars — all in one
              place.
            </p>
          </div>

          <div className="w-full max-w-2xl rounded-lg border border-white/15 bg-white/10 p-2 shadow-lg backdrop-blur-md">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search events by name…"
              className="w-full"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-16">
        {/* --------------------------------------------------------- filters
            Single bar that morphs while pinning — see the effect above. The
            sentinel's negative bottom margin cancels the column gap so the
            bar sits exactly at the sentinel. */}
        <div ref={filterSentinelRef} aria-hidden className="-mt-8 -mb-16 h-0" />
        <div
          ref={filterBarRef}
          style={{ ["--p" as string]: 0 }}
          className="border-border-light sticky top-24 z-20 overflow-hidden rounded-lg border p-4 shadow-md [backdrop-filter:blur(calc(var(--p)*16px))] [background:color-mix(in_srgb,var(--color-surface-light)_calc(100%-var(--p)*12%),transparent)]"
        >
          <div
            ref={filterTabsRef}
            role="tablist"
            aria-label="Event category"
            className="relative flex w-fit max-w-full [scrollbar-width:none] gap-1 overflow-x-auto overflow-y-hidden"
          >
            {categoryTabs.map((tab) => {
              const active = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleTabChange(tab.value)}
                  className={`text-body focus-visible:ring-primary/20 relative shrink-0 rounded-sm px-4 py-2 font-medium whitespace-nowrap focus-visible:ring-4 focus-visible:outline-none ${
                    active
                      ? "[color:color-mix(in_srgb,#fff_calc(var(--p)*100%),var(--color-secondary))] transition-colors"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {active && (
                    <>
                      {/* compact state: navy pill */}
                      <span
                        aria-hidden
                        className="bg-primary absolute inset-0 rounded-sm [opacity:var(--p)] shadow-sm"
                      />
                      {/* expanded state: red underline */}
                      <span
                        aria-hidden
                        className="bg-secondary absolute inset-x-0 bottom-0 h-0.5 rounded-full [opacity:calc(1-var(--p))]"
                      />
                    </>
                  )}
                  <span className="relative">{tab.label}</span>
                </button>
              );
            })}
          </div>
          {/* divider under the tab row — fades out as the bar compacts */}
          <div
            ref={filterDividerRef}
            aria-hidden
            className="bg-border-light pointer-events-none absolute inset-x-4 h-px"
          />
          {/* Chips: outer layer moves on X, inner on Y, so the two axes can
              be sequenced into an L-shaped path (see effect). */}
          <div
            ref={filterChipsRef}
            className="absolute top-0 left-0 will-change-transform"
          >
            <div
              ref={filterChipsYRef}
              className="flex [scrollbar-width:none] flex-nowrap gap-2 will-change-transform"
            >
              {renderFilterChips()}
            </div>
          </div>
        </div>

        {/* <section className="bg-secondary-light overflow-hidden rounded-lg p-6 sm:p-8">
        <h3 className="text-large text-text-primary font-bold">
          Why join GCODE Events?
        </h3>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {whyJoinItems.map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <Icon icon={item.icon} size="lg" className="text-secondary shrink-0" />
              <div>
                <h4 className="text-body text-text-primary font-semibold">
                  {item.title}
                </h4>
                <p className="text-small text-text-secondary">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section> */}

        {/* -------------------------------------------------------- featured */}
        {featured.length > 0 &&
          activeFeaturedEvent &&
          (() => {
            const event = activeFeaturedEvent;
            const blurb =
              event.summary || featuredDescriptionLines[0] || undefined;
            return (
              <section
                className="flex flex-col gap-5"
                onMouseEnter={() => setFeaturedPaused(true)}
                onMouseLeave={() => setFeaturedPaused(false)}
              >
                <SectionHeader
                  title="Featured events"
                  subtitle="Hand-picked by the GCODE team"
                  action={
                    featured.length > 1 && (
                      <div className="flex items-center gap-2">
                        <CarouselButton
                          label="Previous featured event"
                          icon={ChevronLeft}
                          onClick={() =>
                            setFeaturedIndex(
                              (activeFeaturedIndex - 1 + featured.length) %
                                featured.length,
                            )
                          }
                        />
                        <CarouselButton
                          label="Next featured event"
                          icon={ChevronRight}
                          onClick={() =>
                            setFeaturedIndex(
                              (activeFeaturedIndex + 1) % featured.length,
                            )
                          }
                        />
                      </div>
                    )
                  }
                />

                <article
                  key={event.id}
                  className="group relative isolate flex min-h-90 overflow-hidden rounded-lg bg-black shadow-lg"
                >
                  {event.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.coverImageUrl}
                      alt=""
                      className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="bg-primary absolute inset-0 -z-10" />
                  )}
                  <div className="absolute inset-0 -z-10 bg-linear-to-r from-black/90 via-black/65 to-black/10" />

                  <div className="flex max-w-2xl flex-col justify-end gap-4 p-6 sm:p-10">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="solid" tone="warning">
                        Featured
                      </Badge>
                      <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
                        {event.type}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-3xl font-extrabold text-white sm:text-4xl">
                        {event.title}
                      </h3>
                      {blurb && (
                        <p className="mt-3 line-clamp-2 text-white/75 sm:text-lg">
                          {blurb}
                        </p>
                      )}
                    </div>

                    <p className="text-small flex flex-wrap items-center gap-x-2 gap-y-1 text-white/75">
                      <Icon icon={Calendar} size="sm" className="opacity-80" />
                      {[
                        event.startDateIso
                          ? `${formatWeekday(event.startDateIso).slice(0, 3)}, ${event.date}`
                          : event.date,
                        formatTimeRange(event.startDateIso, null),
                        event.mode === "Online" ? "Online" : event.location,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <ButtonLink
                        href={`/events/${event.id}/register`}
                        variant="accent"
                      >
                        Reserve Seat <Icon size="sm" icon={ArrowRight} />
                      </ButtonLink>
                      <ButtonLink
                        href={`/events/${event.id}`}
                        variant="secondary"
                        className="!border-white/25 !bg-white/10 !text-white backdrop-blur hover:!bg-white/20"
                      >
                        View Details
                      </ButtonLink>
                      <span className="text-large ml-1 font-bold text-white">
                        {event.price}
                      </span>
                    </div>
                  </div>
                </article>

                {featured.length > 1 && (
                  <div className="flex items-center justify-center gap-1.5">
                    {featured.map((f, index) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFeaturedIndex(index)}
                        aria-label={`Go to featured event ${index + 1}`}
                        aria-current={index === activeFeaturedIndex}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          index === activeFeaturedIndex
                            ? "bg-primary w-6"
                            : "bg-border-hover hover:bg-text-secondary/40 w-1.5"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })()}

        {/* -------------------------------------------------------- upcoming */}
        <section className="flex flex-col gap-6">
          <SectionHeader
            title="Upcoming events"
            subtitle="Grab your seat before they fill up"
            count={status === "ready" ? upcomingFiltered.length : undefined}
            action={
              hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                  Clear filters
                </Button>
              )
            }
          />

          {status === "loading" ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <EventCardSkeleton key={index} />
              ))}
            </div>
          ) : status === "error" ? (
            <EmptyState
              icon={CalendarX}
              title="Couldn't load events"
              description="Something went wrong on our end. Refresh the page to try again."
              action={
                <Button
                  variant="secondary"
                  onClick={() => window.location.reload()}
                >
                  Refresh
                </Button>
              }
            />
          ) : upcomingFiltered.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No events match these filters"
              description={
                hasActiveFilters
                  ? "Try a different category, clear a filter, or search for something else."
                  : "There's nothing here yet — check back soon."
              }
              action={
                hasActiveFilters ? (
                  <Button variant="secondary" onClick={clearAllFilters}>
                    Clear all filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingFiltered.map((event) => (
                <EventCard
                  key={event.id}
                  variant="default"
                  {...defaultCardProps(event)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------ past */}
        {pastFiltered.length > 0 && (
          <section className="flex flex-col gap-6">
            <SectionHeader
              title="Past events"
              subtitle="Events that have already ended"
              count={pastFiltered.length}
              muted
            />

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visiblePast.map((event) => (
                <EventCard
                  key={event.id}
                  variant="default"
                  isPast
                  {...defaultCardProps(event)}
                />
              ))}
            </div>

            {pastVisibleCount < pastFiltered.length && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setPastVisibleCount(
                      (prev) => prev + PAST_EVENTS_LOAD_MORE_COUNT,
                    )
                  }
                >
                  View More
                </Button>
              </div>
            )}
          </section>
        )}

        {/* ------------------------------------------------------- host CTA */}
        <section className="bg-primary relative isolate overflow-hidden rounded-lg px-6 py-10 shadow-lg sm:px-10 sm:py-12">
          <div className="bg-secondary/20 absolute -top-24 -right-16 -z-10 size-72 rounded-full blur-3xl" />
          <div className="absolute -bottom-28 left-1/3 -z-10 size-72 rounded-full bg-sky-400/10 blur-3xl" />
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <p className="text-xs font-semibold tracking-widest text-white/60 uppercase">
                For organizers
              </p>
              <h2 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">
                Have an event in mind? Host it with GCODE.
              </h2>
              <p className="mt-2 text-white/70">
                Set up registrations, tickets, rounds and judging in a few
                guided steps — and reach the whole community.
              </p>
            </div>
            <ButtonLink
              href="/my-organized-events/new"
              variant="accent"
              size="lg"
              className="shrink-0"
            >
              Host an event <Icon size="sm" icon={ArrowRight} />
            </ButtonLink>
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  count,
  action,
  muted = false,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  action?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2
          className={`flex items-center gap-3 text-2xl font-bold ${muted ? "text-text-secondary" : "text-text-primary"}`}
        >
          {title}
          {count !== undefined && (
            <span className="bg-bg-light text-text-secondary text-small rounded-full px-2.5 py-0.5 font-semibold tabular-nums">
              {count}
            </span>
          )}
        </h2>
        {subtitle && (
          <p className="text-body text-text-secondary mt-1">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function CarouselButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="border-border-light bg-surface-light text-text-secondary hover:text-text-primary hover:border-border-hover focus-visible:ring-primary/20 flex size-10 items-center justify-center rounded-full border shadow-sm transition-colors focus-visible:ring-4 focus-visible:outline-none"
    >
      <Icon icon={icon} size="sm" />
    </button>
  );
}
