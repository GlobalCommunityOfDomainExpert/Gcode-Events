"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PencilOff } from "lucide-react";
import { EditorSkeleton, NotFoundState } from "@/components/molecules";
import {
  getEvent,
  listEventFaqs,
  listEventMedia,
  listEventSocialLinks,
  listEventTimeline,
  listEventQuestions,
  getEventAdvancedEnabled,
  listAdvancedOptionSettings,
  listAdvancedOptions,
} from "@/lib/api/events";
import { listEventRounds } from "@/lib/api/rounds";
import {
  toEventDraft,
  attachAdvancedQuestionConfiguration,
} from "@/lib/api/adapters";
import { EventEditor } from "@/app/(app)/(events)/my-organized-events/_components/event-editor";
import type { EventDetail } from "@/lib/api/types";
import { EventDetailData } from "@/lib/zod/event";

type LoadStatus = "loading" | "error" | "ready";

export default function EditOrganizedEventPage() {
  const params = useParams<{ id: string }>();
  const [draft, setDraft] = useState<EventDetailData | undefined>(undefined);
  const [detail, setDetail] = useState<EventDetail | undefined>(undefined);
  const [status, setStatus] = useState<LoadStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus("loading");
      try {
        const [
          detail,
          timeline,
          rounds,
          questions,
          links,
          media,
          faqs,
          advancedEnabled,
        ] = await Promise.all([
          getEvent(params.id),
          listEventTimeline(params.id),
          listEventRounds(params.id),
          listEventQuestions(params.id),
          listEventSocialLinks(params.id),
          listEventMedia(params.id),
          listEventFaqs(params.id),
          getEventAdvancedEnabled(params.id).catch(() => false),
        ]);
        let optionSettings: Awaited<
          ReturnType<typeof listAdvancedOptionSettings>
        > = [];
        let advancedOptions: Awaited<ReturnType<typeof listAdvancedOptions>> =
          [];
        if (advancedEnabled) {
          [optionSettings, advancedOptions] = await Promise.all([
            listAdvancedOptionSettings(params.id),
            listAdvancedOptions(params.id),
          ]);
        }
        if (cancelled) return;
        const draft = toEventDraft(
          detail,
          timeline,
          rounds,
          questions,
          links,
          media,
          faqs,
        );
        draft.advancedAdditionalQuestionsEnabled = advancedEnabled;
        draft.questions = attachAdvancedQuestionConfiguration(
          draft.questions,
          optionSettings,
          advancedOptions,
        );
        setDetail(detail);
        setDraft(draft);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (!draft && !detail && status === "loading") {
    return <EditorSkeleton />;
  }

  if (!draft || !detail) {
    return (
      <NotFoundState
        icon={PencilOff}
        title="Can't edit this event"
        description="This event may not exist, or it couldn't be loaded."
        actionHref="/my-organized-events"
        actionLabel="Back to Organizing"
      />
    );
  }

  return (
    <EventEditor
      mode="edit"
      eventId={params.id}
      initialData={draft}
      baseDetail={detail}
    />
  );
}
