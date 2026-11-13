import { MapPin, Navigation } from "lucide-react";
import { Icon } from "@/components/atoms";

export const directionsUrl = (location: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}`;

/** Just the embedded map, for cards that render their own venue row. */
export function MapEmbed({
  location,
  className = "",
}: {
  location: string;
  className?: string;
}) {
  return (
    <div className={`bg-bg-light relative aspect-[16/7] w-full ${className}`}>
      <iframe
        title={`Map showing ${location.split(",")[0]}`}
        src={`https://maps.google.com/maps?q=${encodeURIComponent(location)}&z=15&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}

/** Embedded map + venue name/address + "Get directions". */
export function VenueMap({ location }: { location: string }) {
  // "Pinnacle School…, 36/3 & 36/6, …, Bengaluru" → bold name + lighter rest.
  const [name, ...rest] = location.split(",").map((x) => x.trim());
  const address = rest.join(", ");
  return (
    <div className="border-border-light bg-surface-light @container overflow-hidden rounded-lg border shadow-sm">
      <div className="bg-bg-light relative aspect-[16/7] w-full">
        <iframe
          title={`Map showing ${name}`}
          src={`https://maps.google.com/maps?q=${encodeURIComponent(location)}&z=15&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
      <div className="flex flex-col gap-4 p-5 @sm:flex-row @sm:items-center @sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-secondary-light text-secondary flex size-10 shrink-0 items-center justify-center rounded-md">
            <Icon icon={MapPin} size="sm" />
          </span>
          <div className="min-w-0">
            <p className="text-text-primary font-semibold">
              {name || "Venue to be announced"}
            </p>
            {address && (
              <p className="text-small text-text-secondary mt-0.5">{address}</p>
            )}
          </div>
        </div>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-primary hover:bg-primary-hover text-small inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-sm px-4 font-semibold text-white shadow-sm transition-colors"
        >
          <Icon icon={Navigation} size="sm" />
          Get directions
        </a>
      </div>
    </div>
  );
}
