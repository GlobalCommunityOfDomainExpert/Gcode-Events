"use client";

import { useCallback, useEffect, useState } from "react";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { LiveRoom } from "@/components/live-room";
import { useEvent } from "@/hooks/use-event";
import { useSession } from "@/hooks/use-session";
import {
  getLiveAccess,
  requestJoinCredential,
  type JoinInfo,
  type LiveAccess,
} from "@/lib/api/webinar";
import { formatTimeRange, formatWeekday } from "@/lib/event";
import { RoomFrame, RoomPanel, btnLight } from "./_components/room-frame";
import {
  EarlyScreen,
  EndedScreen,
  LeftScreen,
  NotRegisteredScreen,
} from "./_components/screens";
import { WaitingRoom } from "./_components/waiting-room";
import { withBasePath } from "@/lib/base-path";

// The one door to a webinar: /<id>/live.
//
// Who the viewer is, whether they are registered, and what state the room is
// in all come from the server (live-access). Nothing in the URL can change
// them: there is no role or demo override, and a copied link only works for
// the signed-in person whose registration it belongs to.
//
//  1. Not signed in / not registered → sign in or register first.
//  2. Before the doors open → countdown (speakers and host can go backstage).
//  3. Doors open / live → waiting room → the room, with a credential the
//     server mints for this person's registration.
//  4. Left → rejoin while it is running. Ended → replay, if published.
export default function WebinarLivePage() {
  return (
    <Suspense fallback={null}>
      <WebinarLive />
    </Suspense>
  );
}

function WebinarLive() {
  const params = useParams<{ id: string }>();
  const session = useSession();
  // The signed link from the registration email (?t=...): it lets a guest
  // with no account prove their ticket. Nothing else in the URL means anything.
  const linkToken = useSearchParams().get("t");
  const identified = !!session || !!linkToken;
  const { event, status } = useEvent(params.id);
  const [access, setAccess] = useState<LiveAccess | null>();
  const [stage, setStage] = useState<
    { kind: "door" } | { kind: "room"; join: JoinInfo } | { kind: "left" }
  >({ kind: "door" });

  const refresh = useCallback(async () => {
    try {
      setAccess(await getLiveAccess(params.id, linkToken));
    } catch {
      setAccess(null);
    }
  }, [params.id, linkToken]);

  // The door opens, goes live and ends on the server's clock: poll so a
  // waiting page moves on by itself.
  useEffect(() => {
    if (!identified) return;
    let live = true;
    const load = () =>
      getLiveAccess(params.id, linkToken)
        .then((a) => live && setAccess(a))
        .catch(() => live && setAccess(null));
    void load();
    const id = setInterval(() => void load(), 20_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [identified, linkToken, params.id]);

  if (status === "loading" || !event) {
    return (
      <RoomFrame title={status === "loading" ? "Loading…" : "Webinar"}>
        <RoomPanel>
          <p className="text-white/70">
            {status === "loading"
              ? "Opening the room…"
              : "We couldn’t find this webinar."}
          </p>
        </RoomPanel>
      </RoomFrame>
    );
  }

  const range = formatTimeRange(event.startDateIso, event.endDateIso);
  const weekday = formatWeekday(event.startDateIso);
  const when = `${weekday ? `${weekday}, ` : ""}${event.date}${range ? ` · ${range} IST` : ""}`;
  const frame = (body: React.ReactNode) => (
    <RoomFrame title={event.title} subtitle={when}>
      {body}
    </RoomFrame>
  );

  if (!identified) {
    return frame(
      <RoomPanel>
        <h1 className="text-display leading-tight font-extrabold">
          Sign in to join
        </h1>
        <p className="text-body text-white/70">
          Your seat is tied to your registration, so we need to know it&apos;s
          you.
        </p>
        <a
          href={withBasePath(`/sign-in?redirect=${encodeURIComponent(`/${event.id}/live`)}`)}
          className={btnLight}
        >
          Sign in
        </a>
      </RoomPanel>,
    );
  }

  if (access === undefined) {
    return frame(
      <RoomPanel>
        <p className="text-white/70">Checking your ticket…</p>
      </RoomPanel>,
    );
  }
  if (access === null) {
    return frame(
      <RoomPanel>
        <h1 className="text-display leading-tight font-extrabold">
          We couldn&apos;t open the room
        </h1>
        <p className="text-body text-white/70">
          Something went wrong checking your ticket. Try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className={btnLight}
        >
          Try again
        </button>
      </RoomPanel>,
    );
  }

  const { role, state } = access;

  // ---- in the room
  if (stage.kind === "room" && state !== "ENDED") {
    return (
      <RoomFrame title={event.title} subtitle={when}>
        <LiveRoom
          eventId={event.id}
          join={stage.join}
          refresh={() => requestJoinCredential(event.id, linkToken)}
          recheck={() => void refresh()}
          name={session?.fullName || "Guest"}
          role={role}
          notice={access.notice}
          slidesUrl={access.slidesUrl}
          onLeave={() => setStage({ kind: "left" })}
        />
      </RoomFrame>
    );
  }
  if (state === "ENDED") {
    return frame(
      <EndedScreen
        event={event}
        replay={access.replay}
        slidesUrl={access.slidesUrl}
      />,
    );
  }
  if (stage.kind === "left") {
    return frame(
      <LeftScreen event={event} onRejoin={() => setStage({ kind: "door" })} />,
    );
  }

  // ---- before joining
  if (!access.registered && role === "attendee") {
    return frame(<NotRegisteredScreen event={event} when={when} />);
  }
  if (state === "EARLY") {
    return frame(<EarlyScreen event={event} role={role} when={when} />);
  }
  return frame(
    <WaitingRoom
      event={event}
      role={role}
      audience={access.audience}
      notice={access.notice}
      name={session?.fullName || "Guest"}
      when={when}
      backstage={state === "BACKSTAGE"}
      onJoin={async () => {
        const join = await requestJoinCredential(event.id, linkToken);
        setStage({ kind: "room", join });
      }}
    />,
  );
}
