import { EventSocialLink } from "@/lib/event";
import { detectSocial } from "@/components/molecules/social-icon";

// Organizer's links as brand logos — the platform name lives in the tooltip
// and accessible label, not on screen.
export function EventLinksCard({ links }: { links: EventSocialLink[] }) {
  if (links.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-text-primary text-xl font-bold">Follow along</h2>
      <div className="flex flex-wrap gap-3">
        {links.map((link, index) => {
          const brand = detectSocial(link.platform, link.url);
          const Logo = brand.icon;
          return (
            <a
              key={index}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={brand.label}
              title={brand.label}
              style={{ ["--brand" as string]: brand.color }}
              className="border-border-light bg-surface-light text-text-primary flex size-12 items-center justify-center rounded-full border shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--brand)] hover:text-[var(--brand)] hover:shadow-md"
            >
              <Logo className="size-5" />
            </a>
          );
        })}
      </div>
    </section>
  );
}
