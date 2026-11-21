import { v1Request, v1RequestPage } from "./client";
import type { EventDetailData } from "@/lib/zod/event";
import type { EventQuestions } from "@/server/modules/questions/questions.schemas";
import type {
  EventDetail,
  EventFaq,
  EventFilters,
  EventMediaItem,
  EventSocialLink,
  EventSummary,
  EventTimelineEntry,
  PatchEventBody,
  SaveEventResult,
} from "@/server/modules/events/events.schemas";

export type {
  EventDetail,
  EventFaq,
  EventFilters,
  EventMediaItem,
  EventSocialLink,
  EventSummary,
  EventTimelineEntry,
  EventQuestions,
  PatchEventBody,
};

// /api/v1/events. Browser-only; server components call the services
// (eventsService, questionsService) directly.

// ── Reads ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

// Every matching event. The UI filters and counts the full list client-side,
// so this walks the pages rather than returning only the first.
export async function listEvents(
  filters: EventFilters = {},
): Promise<EventSummary[]> {
  const items: EventSummary[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, page } = await listEventsPage(filters, offset);
    items.push(...data);
    if (!page.hasMore || data.length === 0) return items;
  }
}

function listEventsPage(filters: EventFilters, offset: number) {
  return v1RequestPage<EventSummary>("/events", {
    query: { ...filters, limit: PAGE_SIZE, offset },
  });
}

export function getEvent(id: number | string): Promise<EventDetail> {
  return v1Request(`/events/${id}`);
}

export function listEventTimeline(
  id: number | string,
): Promise<EventTimelineEntry[]> {
  return v1Request(`/events/${id}/timeline`);
}

export function listEventFaqs(id: number | string): Promise<EventFaq[]> {
  return v1Request(`/events/${id}/faqs`);
}

// Already in display order.
export function listEventMedia(id: number | string): Promise<EventMediaItem[]> {
  return v1Request(`/events/${id}/media`);
}

export function listEventSocialLinks(
  id: number | string,
): Promise<EventSocialLink[]> {
  return v1Request(`/events/${id}/social-links`);
}

// Custom questions plus the advanced follow-up tree, in one request.
export function getEventQuestions(
  id: number | string,
): Promise<EventQuestions> {
  return v1Request(`/events/${id}/questions`);
}

// ── Organizer writes (admin) ─────────────────────────────────────────────

// Creates the event and everything in the draft (links, media, timeline,
// rounds, questions, follow-up tree, FAQs, categories) in one transaction.
// The cover is uploaded separately with uploadCoverImage.
export function createEventFromDraft(
  draft: EventDetailData,
  statusId?: number,
): Promise<SaveEventResult> {
  return v1Request("/events", { method: "POST", body: { draft, statusId } });
}

// Saves the whole draft over the existing event, atomically.
export function saveEventDraft(
  id: number | string,
  draft: EventDetailData,
  statusId?: number,
): Promise<SaveEventResult> {
  return v1Request(`/events/${id}`, {
    method: "PUT",
    body: { draft, statusId },
  });
}

// Flips individual settings (status, rating mode, a pass open/closed).
export function patchEvent(
  id: number | string,
  patch: PatchEventBody,
): Promise<void> {
  return v1Request(`/events/${id}`, { method: "PATCH", body: patch });
}

export function deleteEvent(id: number | string): Promise<void> {
  return v1Request(`/events/${id}`, { method: "DELETE" });
}

export function uploadCoverImage(
  id: number | string,
  blob: Blob,
): Promise<void> {
  return v1Request(`/events/${id}/cover-image`, {
    method: "PUT",
    raw: { body: blob },
  });
}
