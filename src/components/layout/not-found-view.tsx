"use client";

import Link from "next/link";
import { ButtonLink } from "@/components/atoms";
import { useSession } from "@/hooks/use-session";
import { isAdmin } from "@/lib/auth/session";
import { EventsShell } from "./events-shell";

// Route-level 404, in the GCODE product style used across the family of
// apps: oversized muted "404" whose zero is the GCODE ring-and-bar mark,
// a short human message, two actions and a couple of quiet links. Rendered
// inside the events shell so navbar and footer stay put.
export function NotFoundView() {
  const session = useSession();
  const canSeeMyEvents = !!session && isAdmin(session);

  return (
    <EventsShell session={session}>
      <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
        <p
          aria-hidden="true"
          className="text-text-secondary/40 flex items-center justify-center gap-2 text-[6rem] leading-none font-extrabold select-none sm:gap-4 sm:text-[11rem]"
        >
          <span>4</span>
          {/* the GCODE "G": a ring with a bar entering from the right */}
          <span className="relative block size-[5rem] rounded-full border-[0.9rem] border-current sm:size-[9rem] sm:border-[1.6rem]">
            <span className="absolute top-1/2 left-1/2 h-[0.9rem] w-[3.2rem] -translate-y-1/2 rounded-full bg-current sm:h-[1.6rem] sm:w-[5.8rem]" />
          </span>
          <span>4</span>
        </p>

        <h1 className="text-heading text-text-primary sm:text-display mt-6 font-extrabold">
          We can&apos;t find that page
        </h1>
        <p className="text-body text-text-secondary mt-3 max-w-md">
          The link may be old or mistyped, or the event may have been removed.
          Browse what&apos;s on instead.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/events" variant="primary">
            Browse events
          </ButtonLink>
          {canSeeMyEvents ? (
            <ButtonLink href="/my-events" variant="secondary">
              My events
            </ButtonLink>
          ) : (
            <ButtonLink href="https://gcode.in" variant="secondary">
              Go to gcode.in
            </ButtonLink>
          )}
        </div>

        <div className="text-small text-text-secondary mt-6 flex items-center gap-6">
          <Link href="/about-us" className="hover:text-text-primary">
            About us
          </Link>
          <Link href="/contact-us" className="hover:text-text-primary">
            Contact us
          </Link>
        </div>
      </div>
    </EventsShell>
  );
}
