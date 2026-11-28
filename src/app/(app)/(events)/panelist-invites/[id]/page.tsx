"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import NextLink from "next/link";
import { Compass } from "lucide-react";
import { Button, Card } from "@/components/atoms";
import {
  Banner,
  CenteredCardSkeleton,
  NotFoundState,
} from "@/components/molecules";
import { useSession } from "@/hooks/use-session";
import {
  getPanelistInvite,
  respondToPanelistInvite,
} from "@/lib/api/panelists";
import { adaptPanelistInvite, PanelistInvite } from "@/lib/api/adapters";
import { ApiError } from "@/lib/api/client";

// Copy and next step differ per role. Judges go to scoring; speakers and
// mentors go to the event (the live room door when it is switched on).
const ROLE_COPY = {
  JUDGE: {
    noun: "judge",
    title: "Judge invite",
    ask: "You've been invited to judge as a panelist for this event.",
    accepted: "You've accepted this invite — you can now judge.",
  },
  MENTOR: {
    noun: "mentor",
    title: "Mentor invite",
    ask: "You've been invited to mentor at this event.",
    accepted: "You're in — you're mentoring at this event.",
  },
  SPEAKER: {
    noun: "speaker",
    title: "Speaker invite",
    ask: "You've been invited to speak at this event.",
    accepted: "You're in — you're speaking at this event.",
  },
} as const;

export default function PanelistInvitePage() {
  const params = useParams<{ id: string }>();
  const session = useSession();

  const [invite, setInvite] = useState<PanelistInvite | undefined>();
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const row = await getPanelistInvite(params.id);
        if (cancelled) return;
        setInvite(adaptPanelistInvite(row));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function handleRespond(next: "ACCEPTED" | "DECLINED") {
    setResponding(true);
    setError("");
    try {
      await respondToPanelistInvite(params.id, next);
      setInvite((prev) => (prev ? { ...prev, status: next } : prev));
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't save your response.",
      );
    } finally {
      setResponding(false);
    }
  }

  if (status === "loading") {
    return <CenteredCardSkeleton label="Fetching your invite…" />;
  }

  if (status === "error" || !invite) {
    return (
      <NotFoundState
        icon={Compass}
        title="Invite not found"
        description="We couldn't find this panelist invite. Check the link from your email."
        actionHref="/"
        actionLabel="Home"
      />
    );
  }

  const copy = ROLE_COPY[invite.role];
  const nextHref =
    invite.role === "JUDGE"
      ? `/judge/${invite.eventId}`
      : invite.role === "SPEAKER"
        ? `/${invite.eventId}/live`
        : `/${invite.eventId}`;
  const nextLabel =
    invite.role === "JUDGE"
      ? "Go to Judging"
      : invite.role === "SPEAKER"
        ? "Go to live room"
        : "View event";

  if (!session) {
    return (
      <div className="mx-auto max-w-md">
        <Card padding="md" className="space-y-4 text-center">
          <h1 className="text-large text-text-primary font-bold">
            {copy.title} for {invite.eventTitle}
          </h1>
          <p className="text-body text-text-secondary">
            Sign in or create an account with{" "}
            <span className="text-text-primary font-medium">
              {invite.invitedEmail}
            </span>
            , then open this link again to respond.
          </p>
          <div className="flex justify-center gap-3">
            <NextLink
              href={`/sign-in?redirect=${encodeURIComponent(`/panelist-invites/${params.id}`)}`}
            >
              <Button variant="secondary">Sign In</Button>
            </NextLink>
            <NextLink
              href={`/sign-up?redirect=${encodeURIComponent(`/panelist-invites/${params.id}`)}`}
            >
              <Button variant="primary">Create Account</Button>
            </NextLink>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <Card padding="md" className="space-y-4 text-center">
        <h1 className="text-large text-text-primary font-bold">
          {copy.title} for {invite.eventTitle}
        </h1>

        {invite.note && (
          <p className="text-body text-text-primary border-border-light bg-bg-subtle rounded-md border p-3 text-left whitespace-pre-wrap italic">
            “{invite.note}”
          </p>
        )}

        {error && <Banner tone="danger">{error}</Banner>}

        {invite.status === "ACCEPTED" ? (
          <>
            <p className="text-body text-success font-medium">
              {copy.accepted}
            </p>
            <NextLink href={nextHref}>
              <Button variant="primary">{nextLabel}</Button>
            </NextLink>
          </>
        ) : invite.status === "DECLINED" ? (
          <p className="text-body text-text-secondary">
            You&apos;ve declined this invite.
          </p>
        ) : (
          <>
            <p className="text-body text-text-secondary">{copy.ask}</p>
            <div className="flex justify-center gap-3">
              <Button
                variant="secondary"
                disabled={responding}
                onClick={() => handleRespond("DECLINED")}
              >
                Decline
              </Button>
              <Button
                variant="primary"
                disabled={responding}
                onClick={() => handleRespond("ACCEPTED")}
              >
                {responding ? "Saving…" : "Accept"}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
