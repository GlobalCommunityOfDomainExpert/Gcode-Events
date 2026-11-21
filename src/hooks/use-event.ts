"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getEvent,
  listEventFaqs,
  listEventMedia,
  listEventSocialLinks,
  listEventTimeline,
  getEventQuestions,
} from "@/lib/api/events";
import { listEventRounds } from "@/lib/api/rounds";
import { getEventTypes, getModes, getStatuses } from "@/lib/api/lookups";
import {
  adaptApiEvent,
  adaptTimelineItem,
  adaptEventRound,
  formatDuration,
  attachAdvancedQuestionConfiguration,
} from "@/lib/api/adapters";
import { Event } from "@/lib/event";

type FetchStatus = "loading" | "error" | "ready";

// Fetches one event by id + the lookup tables, then adapts to the UI Event shape.
export function useEvent(id: string | undefined) {
  const [event, setEvent] = useState<Event | undefined>(undefined);
  const [status, setStatus] = useState<FetchStatus>("loading");

  // Exposed so callers (e.g. the organizer's runtime pass open/close toggle)
  // can re-fetch after writing, instead of only ever fetching once on mount.
  // `silent` re-fetches in the background without flipping to "loading", so
  // the page doesn't flash its skeleton (used after "I'm Interested").
  const refresh = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!id) return;
      if (!silent) setStatus("loading");
      try {
        const [
          detail,
          timeline,
          rounds,
          questions,
          links,
          media,
          faqs,
          types,
          modes,
          statuses,
        ] = await Promise.all([
          getEvent(id),
          listEventTimeline(id),
          // Rounds are optional extras; never let them take the page down.
          listEventRounds(id).catch(() => []),
          getEventQuestions(id),
          listEventSocialLinks(id),
          listEventMedia(id),
          listEventFaqs(id),
          getEventTypes(),
          getModes(),
          getStatuses(),
        ]);
        const typeNames = Object.fromEntries(types.map((t) => [t.id, t.name]));
        const modeNames = Object.fromEntries(modes.map((m) => [m.id, m.code]));
        const statusCodes = Object.fromEntries(
          statuses.map((s) => [s.id, s.code]),
        );
        const adapted = adaptApiEvent(
          detail,
          typeNames,
          modeNames,
          statusCodes,
          questions.questions,
        );
        // Fall back to timeline span when the event has no explicit end date.
        let duration = adapted.duration;
        if (!duration && timeline.length > 0) {
          const starts = timeline
            .filter((t) => t.startTime)
            .map((t) => new Date(t.startTime as string).getTime());
          const ends = timeline
            .filter((t) => t.endTime)
            .map((t) => new Date(t.endTime as string).getTime());
          if (starts.length > 0 && ends.length > 0) {
            duration = formatDuration(
              new Date(Math.min(...starts)).toISOString(),
              new Date(Math.max(...ends)).toISOString(),
            );
          }
        }
        const enrichedQuestions = attachAdvancedQuestionConfiguration(
          adapted.questions,
          questions.advanced.settings,
          questions.advanced.options,
        );
        setEvent({
          ...adapted,
          advancedAdditionalQuestionsEnabled: questions.advanced.enabled,
          questions: enrichedQuestions,
          timeline: timeline.map(adaptTimelineItem),
          rounds: rounds.map(adaptEventRound),
          socialLinks: links.map(({ platform, url }) => ({ platform, url })),
          faqs: faqs.map(({ question, answer }) => ({ question, answer })),
          mediaUrls:
            media.length > 0 ? media.map((m) => m.url) : adapted.mediaUrls,
          duration,
        });
        setStatus("ready");
      } catch {
        // A failed background refresh keeps showing the last good event.
        if (!silent) setStatus("error");
      }
    },
    [id],
  );

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  return { event, status, refresh };
}
