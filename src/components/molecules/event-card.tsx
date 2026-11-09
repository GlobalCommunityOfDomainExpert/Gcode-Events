import {
  ArrowRight,
  Calendar,
  Clock,
  Image as ImageIcon,
  LucideIcon,
  MapPin,
  Users,
} from "lucide-react";
import NextLink from "next/link";
import {
  Badge,
  BadgeTone,
  Button,
  ButtonLink,
  Icon,
  Skeleton,
} from "@/components/atoms";
import { getEventColor } from "@/lib/event-color";
import { AvatarGroup, AvatarGroupItem } from "./avatar-group";

export interface EventCardTag {
  label: string;
  tone?: BadgeTone;
}

export interface EventCardProps {
  variant?: "default" | "featured";
  imageSrc?: string;
  imageAlt?: string;
  colorSeed: string;
  headerLabel?: string;
  tags: EventCardTag[];
  title: string;
  href?: string;
  date: string;
  location?: string;
  attendees?: AvatarGroupItem[];
  attendeesLabel?: string;
  urgencyLabel?: string;
  /** CTA button label. Defaults to "Register Now" (featured) / "Reserve Seat" (default). */
  actionLabel?: string;
  onAction?: () => void;
  /** Event type name (e.g. "Webinar", "Hackathon") — picks which extra field below is most relevant. */
  eventType?: string;
  /** Session length (e.g. "1h 30m") — shown for talk/session formats when eventType is one of those. */
  durationText?: string;
  /** Remaining capacity — shown for competitive/limited-entry formats when eventType is one of those. */
  spotsLeft?: number;
  /** Grays out the card and swaps the header badge to "Event Ended" — "default" variant only. */
  isPast?: boolean;
  /** One-line description under the title — "featured" variant only. */
  subtitle?: string;
  /** Paragraph description — shown under the title on both variants. */
  description?: string;
  /** Up to 4 icon+stat blocks (e.g. date, participants) — "featured" variant only. */
  stats?: { icon: LucideIcon; primary: string; secondary: string }[];
  /** Shown as a badge next to the action button (not in the top tags row) — "featured" variant only. */
  price?: string;
  priceTone?: BadgeTone;
  /** Line under the date (e.g. weekday "Sunday") — "default" variant only. */
  dateDetail?: string;
  /** Start time (e.g. "12:00 PM") — "default" variant, appended to the date line. */
  time?: string;
  /** Primary CTA target (e.g. the register page) — "default" variant; the CTA is hidden when neither this nor onAction is set. */
  actionHref?: string;
  /** Label of the secondary button that links to href — "default" variant only. */
  detailsLabel?: string;
}

// Different event formats care about different secondary info: a webinar's
// audience wants to know how long the session runs; a hackathon's audience
// wants to know if there's still room to join. Falls back to attendeesLabel
// (e.g. "N going") for formats without a more specific signal.
const SESSION_FORMAT_TYPES = ["Webinar", "Expert AMA"];
const COMPETITIVE_FORMAT_TYPES = ["Hackathon", "Ideathon"];

function resolveSecondaryInfo({
  eventType,
  durationText,
  spotsLeft,
  attendeesLabel,
}: Pick<
  EventCardProps,
  "eventType" | "durationText" | "spotsLeft" | "attendeesLabel"
>): { icon: LucideIcon; text: string } | null {
  if (eventType && SESSION_FORMAT_TYPES.includes(eventType) && durationText) {
    return { icon: Clock, text: durationText };
  }
  if (
    eventType &&
    COMPETITIVE_FORMAT_TYPES.includes(eventType) &&
    spotsLeft !== undefined
  ) {
    return {
      icon: Users,
      text: spotsLeft > 0 ? `${spotsLeft} spots left` : "Fully booked",
    };
  }
  if (attendeesLabel) {
    return { icon: Users, text: attendeesLabel };
  }
  return null;
}

function EventCardMedia({
  src,
  alt,
  colorSeed,
}: {
  src?: string;
  alt: string;
  colorSeed: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
      />
    );
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ backgroundColor: getEventColor(colorSeed) }}
    >
      <Icon icon={ImageIcon} size="lg" className="text-white/40" />
    </div>
  );
}

const priceTextToneClass: Record<BadgeTone, string> = {
  neutral: "text-text-primary",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export function EventCard({
  variant = "default",
  imageSrc,
  imageAlt,
  colorSeed,
  headerLabel,
  tags,
  title,
  href,
  date,
  location,
  attendees,
  attendeesLabel,
  urgencyLabel,
  actionLabel,
  onAction,
  eventType,
  durationText,
  spotsLeft,
  isPast = false,
  subtitle,
  description,
  stats,
  price,
  priceTone,
  dateDetail,
  time,
  actionHref,
  detailsLabel = "View Details",
}: EventCardProps) {
  const secondaryInfo = resolveSecondaryInfo({
    eventType,
    durationText,
    spotsLeft,
    attendeesLabel,
  });

  if (variant === "featured") {
    const featuredActionLabel = actionLabel ?? "Register Now";
    const featuredContent = (
      <>
        <div className="relative aspect-video shrink-0 overflow-hidden rounded-t-md sm:aspect-auto sm:w-3/5 sm:rounded-l-md sm:rounded-tr-none">
          <EventCardMedia
            src={imageSrc}
            alt={imageAlt ?? title}
            colorSeed={colorSeed}
          />
        </div>

        <div className="flex flex-1 flex-col gap-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="solid" tone="warning">
              Featured
            </Badge>
            {tags.map((tag) => (
              <Badge
                key={tag.label}
                variant="outline"
                tone={tag.tone ?? "neutral"}
                size="sm"
              >
                {tag.label}
              </Badge>
            ))}
          </div>

          <div>
            {href ? (
              <NextLink
                href={href}
                className="text-large text-text-primary font-bold hover:underline"
              >
                {title}
              </NextLink>
            ) : (
              <h4 className="text-large text-text-primary font-bold">
                {title}
              </h4>
            )}
            {subtitle && (
              <p className="text-body text-text-secondary mt-1 line-clamp-2">
                {subtitle}
              </p>
            )}
          </div>

          {stats && stats.length > 0 && (
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {stats.map((stat, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Icon icon={stat.icon} size="md" className="text-primary" />
                  <div className="text-small">
                    <p className="text-text-primary font-semibold">
                      {stat.primary}
                    </p>
                    <p className="text-text-secondary">{stat.secondary}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {description && (
            <p className="text-body text-text-secondary">{description}</p>
          )}

          {!stats && (
            <div className="space-y-1">
              <p className="text-small text-text-secondary flex items-center gap-2">
                <Icon icon={Calendar} size="sm" />
                {date}
              </p>
              {location && (
                <p className="text-small text-text-secondary flex items-center gap-2">
                  <Icon icon={MapPin} size="sm" />
                  {location}
                </p>
              )}
              {secondaryInfo && (
                <p className="text-small text-text-secondary flex items-center gap-2">
                  <Icon icon={secondaryInfo.icon} size="sm" />
                  {secondaryInfo.text}
                </p>
              )}
            </div>
          )}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-3">
              {href ? (
                <ButtonLink href={href} variant="primary">
                  {featuredActionLabel} <Icon size="sm" icon={ArrowRight} />
                </ButtonLink>
              ) : (
                <Button variant="primary" onClick={onAction}>
                  {featuredActionLabel} <Icon size="sm" icon={ArrowRight} />
                </Button>
              )}
              {price && (
                <span
                  className={`text-body font-semibold ${priceTextToneClass[priceTone ?? "neutral"]}`}
                >
                  {price}
                </span>
              )}
            </div>
            {attendees && attendees.length > 0 && (
              <AvatarGroup
                items={attendees}
                size="sm"
                overflowLabel={attendeesLabel}
              />
            )}
          </div>
        </div>
      </>
    );

    return (
      <div className="border-border-light bg-surface-light flex flex-col overflow-hidden rounded-md border transition-shadow hover:shadow-md sm:min-h-80 sm:flex-row">
        {featuredContent}
      </div>
    );
  }

  const effectiveHeaderLabel = isPast ? "Event Ended" : headerLabel;
  const showAction = !isPast && Boolean(actionHref || onAction);
  const defaultActionLabel = actionLabel ?? "Reserve Seat";

  // Compact card sized for a 3-column grid: cover (with pills + venue chip
  // overlaid), title, 2-line description, date·time and address lines, then a
  // single footer row with attendees and the actions. The whole card is
  // clickable via the title's stretched link, but "View Details" also gets its
  // own quiet text button on every card so users never have to choose between
  // the CTA and clicking the card.
  const primaryButton = showAction ? (
    actionHref ? (
      <ButtonLink
        href={actionHref}
        variant="accent"
        size="xs"
        className="whitespace-nowrap"
      >
        {defaultActionLabel} <Icon size="sm" icon={ArrowRight} />
      </ButtonLink>
    ) : (
      <Button
        variant="accent"
        size="xs"
        className="whitespace-nowrap"
        onClick={onAction}
      >
        {defaultActionLabel} <Icon size="sm" icon={ArrowRight} />
      </Button>
    )
  ) : null;

  const detailsButton = href ? (
    <ButtonLink
      href={href}
      variant="ghost"
      size="xs"
      className="whitespace-nowrap"
    >
      {detailsLabel}
    </ButtonLink>
  ) : null;

  const footerButton =
    primaryButton || detailsButton ? (
      <div className="flex items-center gap-1">
        {detailsButton}
        {primaryButton}
      </div>
    ) : null;

  const dateLine = [
    dateDetail ? `${dateDetail.slice(0, 3)}, ${date}` : date,
    time,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`border-border-light bg-surface-light relative flex h-full flex-col overflow-hidden rounded-xl border shadow-sm ${
        isPast
          ? "grayscale"
          : "group hover:border-border-hover transition duration-300 hover:-translate-y-0.5 hover:shadow-md"
      }`}
    >
      <div className="relative aspect-[16/7] shrink-0 overflow-hidden">
        <EventCardMedia
          src={imageSrc}
          alt={imageAlt ?? title}
          colorSeed={colorSeed}
        />
        {(effectiveHeaderLabel || tags.length > 0) && (
          <div className="absolute top-2.5 left-3 flex flex-wrap gap-1.5">
            {effectiveHeaderLabel && (
              <Badge variant="solid" tone="neutral" size="sm">
                {effectiveHeaderLabel}
              </Badge>
            )}
            {tags.map((tag, index) =>
              index === 0 ? (
                <Badge
                  key={tag.label}
                  variant="solid"
                  tone={tag.tone ?? "neutral"}
                  size="sm"
                  className="shadow-sm"
                >
                  {tag.label}
                </Badge>
              ) : (
                <span
                  key={tag.label}
                  className="text-primary text-small inline-flex h-5 items-center rounded-full bg-white/95 px-2 leading-none font-semibold shadow-sm"
                >
                  {tag.label}
                </span>
              ),
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h4 className="text-large text-text-primary group-hover:text-primary line-clamp-2 leading-snug font-bold transition-colors">
          {href ? (
            // Stretched link: the whole card stays clickable while the
            // footer button (z-10) remains its own target.
            <NextLink
              href={href}
              className="focus-visible:ring-primary rounded-sm after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
            >
              {title}
            </NextLink>
          ) : (
            title
          )}
        </h4>

        <div className="text-small text-text-secondary space-y-1">
          <EventCardInfo icon={Calendar} text={dateLine} />
          {location && <EventCardInfo icon={MapPin} text={location} />}
        </div>

        {urgencyLabel && (
          <p className="text-small text-warning font-medium">{urgencyLabel}</p>
        )}

        <div className="border-border-light mt-auto flex min-h-11 items-center justify-between gap-3 border-t pt-3">
          <span className="text-small text-text-secondary truncate">
            {attendeesLabel ?? secondaryInfo?.text}
          </span>
          {footerButton && (
            <div className="relative z-10 shrink-0">{footerButton}</div>
          )}
        </div>
      </div>
    </article>
  );
}

// One quiet icon + text line, e.g. "Sat, 12 Dec 2026 · 7:00 PM".
function EventCardInfo({ icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <p className="flex min-w-0 items-center gap-2">
      <Icon icon={icon} size="sm" className="shrink-0 opacity-70" />
      <span className="truncate">{text}</span>
    </p>
  );
}

// Mirrors the "default" variant's layout (cover, pills, title, info lines,
// footer) so the loading state doesn't visually jump once real cards arrive —
// used by both /events and /my-organized-events while data loads.
export function EventCardSkeleton() {
  return (
    <div className="border-border-light bg-surface-light flex h-full flex-col overflow-hidden rounded-xl border">
      <Skeleton className="aspect-[16/7] w-full shrink-0 rounded-none" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="border-border-light mt-auto flex items-center justify-between border-t pt-3">
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-11 w-32" />
        </div>
      </div>
    </div>
  );
}
