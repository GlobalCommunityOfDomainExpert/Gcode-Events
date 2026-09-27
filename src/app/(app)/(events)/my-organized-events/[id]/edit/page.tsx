"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PencilOff } from "lucide-react";
import { NotFoundState } from "@/components/molecules";
import {
  getEvent,
  listEventTimeline,
  listEventQuestions,
} from "@/lib/api/events";
import { listEventRounds } from "@/lib/api/rounds";
import { toEventDraft } from "@/lib/api/adapters";
import { EventWizard } from "@/app/(app)/(events)/my-organized-events/_components/event-wizard";
import { EventDetailData } from "@/lib/zod/event";

type LoadStatus = "loading" | "error" | "ready";

export default function EditOrganizedEventPage() {
  const params = useParams<{ id: string }>();
  const [draft, setDraft] = useState<EventDetailData | undefined>(undefined);
  const [status, setStatus] = useState<LoadStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus("loading");
      try {
        const [detail, timeline, rounds, questions] = await Promise.all([
          getEvent(params.id),
          listEventTimeline(params.id),
          listEventRounds(params.id),
          listEventQuestions(params.id),
        ]);
        if (cancelled) return;
        setDraft(toEventDraft(detail, timeline, rounds, questions));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (!draft) {
    return (
      <NotFoundState
        icon={PencilOff}
        title={
          status === "loading" ? "Loading event…" : "Can't edit this event"
        }
        description={
          status === "loading"
            ? "Fetching the event to edit."
            : "This event may not exist, or it couldn't be loaded."
        }
        actionHref="/my-organized-events"
        actionLabel="Back to Organizing"
      />
    );
  }

  return <EventWizard mode="edit" eventId={params.id} initialData={draft} />;
}
