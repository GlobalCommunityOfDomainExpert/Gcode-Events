"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import NextLink from "next/link";
import { Compass } from "lucide-react";
import { Button, Card } from "@/components/atoms";
import { CenteredCardSkeleton, NotFoundState } from "@/components/molecules";
import { useEvent } from "@/hooks/use-event";
import { useAttendees } from "@/hooks/use-attendees";
import { useSession } from "@/hooks/use-session";
import { usePanelistAccess } from "@/hooks/use-panelist-access";
import { resolveActiveRound, RoundDecision } from "@/lib/rounds";
import { listRoundDecisions } from "@/lib/api/rounds";
import { adaptRoundDecision } from "@/lib/api/adapters";
import { RoundsTab } from "@/app/(app)/(events)/my-organized-events/[id]/_components/rounds-tab";
import { LiveJudgeTab } from "./_components/live-judge-tab";

// Deliberately outside /my-organized-events — that path is ADMIN-only
// (EventsAppLayout), but judging is for accepted panelists, who aren't
// ADMINs. No tab switcher and no round browsing — a panelist only ever sees
// whichever single round is currently active (resolveActiveRound's lock-chain
// frontier): Offline -> Live Judging tab (current-performer scoring), Online
// -> RoundsTab locked to that one round (onlyRoundId). No round-level
// assignment yet (STRATEGY.md Phase 2's next slice), so any accepted
// panelist for the event can score whichever round is active.
export default function JudgeEventPage() {
  const params = useParams<{ id: string }>();
  const session = useSession();
  const { event, status: eventStatus } = useEvent(params.id);
  const { attendees } = useAttendees(params.id, {
    attendee: event?.attendeeRegistration.price ?? 0,
    participant: event?.participantRegistration?.price ?? 0,
  });
  const { status: accessStatus, isAcceptedPanelist } = usePanelistAccess(
    params.id,
  );

  // Needed for resolveActiveRound's lock-chain check — same event-wide fetch
  // live-tab.tsx uses on the organizer side.
  const [decisions, setDecisions] = useState<RoundDecision[]>([]);
  useEffect(() => {
    if (!event?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const items = await listRoundDecisions(event.id);
        if (!cancelled) setDecisions(items.map(adaptRoundDecision));
      } catch {
        // best-effort — resolveActiveRound just sees "nothing decided yet"
        // until this loads
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event?.id]);

  if (!session) {
    return (
      <div className="mx-auto max-w-md">
        <Card padding="md" className="space-y-4 text-center">
          <h1 className="text-large text-text-primary font-bold">
            Sign in to judge
          </h1>
          <p className="text-body text-text-secondary">
            Sign in with the account you accepted your panelist invite with.
          </p>
          <NextLink href={`/sign-in?redirect=${encodeURIComponent(`/judge/${params.id}`)}`}>
            <Button variant="primary">Sign In</Button>
          </NextLink>
        </Card>
      </div>
    );
  }

  if (!event || eventStatus === "loading" || accessStatus === "loading") {
    return <CenteredCardSkeleton label="Checking your access…" />;
  }

  if (!isAcceptedPanelist) {
    return (
      <NotFoundState
        icon={Compass}
        title="Not a panelist here"
        description="You haven't accepted a panelist invite for this event, or you're signed in with a different account than the one that was invited."
        actionHref="/"
        actionLabel="Home"
      />
    );
  }

  const activeRound = resolveActiveRound(
    event.rounds,
    decisions,
    attendees.filter((a) => a.category === "Participant").map((a) => a.id),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-large text-text-primary font-bold">
          Judging — {event.title}
        </h1>
        <p className="text-body text-text-secondary">
          {activeRound
            ? activeRound.mode === "Offline"
              ? "Score whoever's currently on stage."
              : `Score participants in "${activeRound.name}".`
            : "No round is currently open for judging."}
        </p>
      </div>
      {activeRound?.mode === "Offline" && (
        <LiveJudgeTab event={event} attendees={attendees} liveRound={activeRound} />
      )}
      {activeRound?.mode === "Online" && (
        <RoundsTab
          event={event}
          attendees={attendees}
          viewerRole="panelist"
          onlyRoundId={activeRound.id}
        />
      )}
    </div>
  );
}
