"use client";

import Link from "next/link";
import { ArrowLeft, Loader } from "lucide-react";
import { Icon } from "@/components/atoms";
import type { WebinarRole } from "@/lib/webinar";

// The one place the video provider's room lives. Pages never import vendor
// code: they hand this component a credential from our server and a role, and
// it renders whatever the active provider needs. Provider-specific behaviour
// stays behind this file, so switching VideoSDK for 100ms touches only here
// and the server adapter.
//
// Until the provider spike passes (Handover 7, Part 0b) there is no provider
// embed, so this renders the "room opens soon" screen. It is never shown to an
// attendee unless NEXT_PUBLIC_LIVE_ROOM is on, and it never pretends to be a
// room: no invented chat, no fake viewers.
export function LiveRoom({
  eventId,
  onLeave,
}: {
  eventId: string;
  /** The credential is in `credential`, used by the provider embed. */
  credential: string;
  role: WebinarRole;
  onLeave: () => void;
}) {
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 items-center px-4 pb-10 sm:px-6">
      <div className="max-w-xl space-y-4">
        <p className="text-small flex items-center gap-2 font-bold tracking-widest text-white/60 uppercase">
          <Icon icon={Loader} size="sm" className="size-4" /> Room opening soon
        </p>
        <h1 className="text-display leading-tight font-extrabold">
          Your seat is held
        </h1>
        <p className="text-body text-white/70">
          The live room isn&apos;t switched on for this session yet. Nothing you
          need to do — come back to this page and it will let you in as soon as
          it is.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-white/25 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            <Icon icon={ArrowLeft} size="sm" /> Leave
          </button>
          <Link
            href={`/events/${eventId}`}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-white/25 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Back to event
          </Link>
        </div>
      </div>
    </main>
  );
}
