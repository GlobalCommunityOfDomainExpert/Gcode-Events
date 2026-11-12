import { Compass, LucideIcon } from "lucide-react";
import { ButtonLink, Icon } from "@/components/atoms";

export interface NotFoundStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}

// In-page "not found / can't open this" state (missing event, bad invite
// link, closed registration…). Same visual language as the route-level 404:
// an oversized muted ring (the GCODE mark) holding the page's icon, a short
// headline, one line of help and a single clear action.
export function NotFoundState({
  icon = Compass,
  title,
  description,
  actionHref,
  actionLabel,
}: NotFoundStateProps) {
  return (
    <div
      role="status"
      className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center px-4 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="text-text-secondary/40 flex size-28 items-center justify-center rounded-full border-[1.1rem] border-current sm:size-32"
      >
        <Icon icon={icon} className="size-12" />
      </span>

      <h2 className="text-heading text-text-primary mt-8 font-extrabold">
        {title}
      </h2>
      <p className="text-body text-text-secondary mt-3">{description}</p>

      <div className="mt-8">
        <ButtonLink href={actionHref} variant="primary">
          {actionLabel}
        </ButtonLink>
      </div>
    </div>
  );
}
