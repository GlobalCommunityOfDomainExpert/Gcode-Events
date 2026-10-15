import { apiRequest, API_BASE_URL, ApiError } from "./client";
import {
  EventDetail,
  EventListItem,
  ApiListResponse,
  CreateEventPayload,
  UpdateEventPayload,
  EventQuestionApi,
} from "./types";

export interface ListEventsParams {
  is_featured?: 0 | 1;
  type_id?: number;
  category_id?: number;
  search?: string;
  [key: string]: string | number | boolean | undefined;
}

export async function listEvents(
  params: ListEventsParams = {},
): Promise<EventListItem[]> {
  const { items } = await apiRequest<ApiListResponse<EventListItem>>(
    "/events/",
    { query: params },
  );
  return items;
}

// GET /events/:id wraps the row in { items: [...] } (ORDS refcursor output).
export async function getEvent(
  id: number | string,
  include?: string,
): Promise<EventDetail> {
  const { items } = await apiRequest<{ items: EventDetail[] }>(
    `/events/${id}`,
    { query: include ? { include } : undefined },
  );
  return items[0];
}

// POST /events returns just { id } (the new row's id), not the full event.
export function createEvent(
  payload: CreateEventPayload,
): Promise<{ id: number }> {
  return apiRequest<{ id: number }>("/events/", {
    method: "POST",
    body: payload,
  });
}

export function updateEvent(
  id: number | string,
  payload: UpdateEventPayload,
): Promise<void> {
  return apiRequest<void>(`/events/${id}`, {
    method: "PUT",
    body: payload,
  });
}

// Child collections: full-replace. Body is a bare JSON array; the ORDS
// handler reads it via :body_text and passes it to the replace_* procs.
export function replaceEventSocialLinks(
  id: number | string,
  items: { platform: string; url: string }[],
): Promise<unknown> {
  return apiRequest(`/events/${id}/social-links`, {
    method: "POST",
    body: items,
  });
}

export function replaceEventMedia(
  id: number | string,
  items: { url: string; sortOrder: number }[],
): Promise<unknown> {
  return apiRequest(`/events/${id}/media`, { method: "POST", body: items });
}

export interface EventTimelineApi {
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  sort_order: number;
}

export async function listEventTimeline(
  id: number | string,
): Promise<EventTimelineApi[]> {
  const { items } = await apiRequest<ApiListResponse<EventTimelineApi>>(
    `/events/${id}/timeline`,
  );
  return items;
}

export function replaceEventTimeline(
  id: number | string,
  items: {
    title: string;
    description: string;
    startTime: string | null;
    endTime: string | null;
    location: string | null;
    sortOrder: number;
  }[],
): Promise<unknown> {
  return apiRequest(`/events/${id}/timeline`, { method: "POST", body: items });
}

// Organizer-authored custom questions (TEXT/RADIO/CHECKBOX, shown on the
// additional-info page). Full-replace child collection, mirrors
// listEventTimeline/replaceEventTimeline above. See adapters.ts'
// QuestionPayloadItem for the item shape (not imported here, same as
// replaceEventTimeline's inline item type below — avoids a circular import,
// since adapters.ts imports EventTimelineApi from this file).
export async function listEventQuestions(
  id: number | string,
): Promise<EventQuestionApi[]> {
  const { items } = await apiRequest<ApiListResponse<EventQuestionApi>>(
    `/events/${id}/questions`,
  );
  return items;
}

export function replaceEventQuestions(
  id: number | string,
  items: {
    prompt: string;
    questionType: "TEXT" | "RADIO" | "CHECKBOX";
    isRequired: 1 | 0;
    sortOrder: number;
    options: { label: string; sortOrder: number }[];
  }[],
): Promise<unknown> {
  return apiRequest(`/events/${id}/questions`, {
    method: "POST",
    body: items,
  });
}

export interface AdvancedOptionSettingApi {
  setting_id: number;
  question_id: number;
  source_option_id: number;
  parent_adv_option_id?: number | null;
  is_enabled: number;
  is_required: number;
  allow_other: number;
  parent_advanced_option_id: number | null;
}
export interface AdvancedOptionApi {
  id: number;
  question_id: number;
  source_option_id: number;
  setting_id: number;
  option_label: string;
  sort_order: number;
}
export function saveAdvancedQuestionConfiguration(id: number | string, items: unknown[]) {
  return apiRequest(`/events/${id}/advanced-question-tree`, { method: "POST", body: items });
}
export async function getEventAdvancedEnabled(id: number | string): Promise<boolean> {
  const { items } = await apiRequest<{ items: { advanced_enabled: number }[] }>(
    `/events/${id}/advanced-question-flag`,
    { cache: "no-store" },
  );
  return Number(items[0]?.advanced_enabled ?? 0) === 1;
}
export function setEventAdvancedEnabled(id: number | string, enabled: boolean) {
  return apiRequest(`/events/${id}/advanced-question-flag`, {
    method: "PUT", body: { advancedEnabled: enabled ? 1 : 0 },
  });
}

export async function listAdvancedOptionSettings(id: number | string) {
  // ORDS paginates this query endpoint too. If only the first page is read,
  // settings for later categories are missing and their follow-ups won't be
  // attached to the event question tree.
  const path = `/events/${id}/advanced-question-tree-settings`;
  const items: AdvancedOptionSettingApi[] = [];
  let pageNumber: number | undefined;

  while (true) {
    const page = await apiRequest<{
      items: AdvancedOptionSettingApi[];
      next?: { $ref: string };
    }>(path, {
      query: pageNumber === undefined ? undefined : { page: pageNumber },
      cache: "no-store",
    });
    items.push(...page.items);

    if (!page.next?.$ref) return items;

    const nextPage = new URL(page.next.$ref, API_BASE_URL).searchParams.get("page");
    const parsedPageNumber = nextPage === null ? NaN : Number(nextPage);
    if (!Number.isInteger(parsedPageNumber) || parsedPageNumber <= (pageNumber ?? 0)) {
      throw new Error("Advanced question settings returned an invalid ORDS next-page link.");
    }
    pageNumber = parsedPageNumber;
  }
}

export function listAdvancedOptions(id: number | string) {
  // The event editor needs the complete choice set at once. In particular,
  // it should not lose the first page of choices if a later ORDS page request
  // is rejected or served from a stale conditional cache entry.
  const path = `/events/${id}/advanced-question-tree-options`;
  return apiRequest<ApiListResponse<AdvancedOptionApi>>(path, {
    query: { limit: 100 },
    cache: "no-store",
  }).then(async (page) => {
    if (!page.hasMore) return page.items;

    const items = [...page.items];
    let offset = page.items.length;
    while (true) {
      const next = await apiRequest<ApiListResponse<AdvancedOptionApi>>(path, {
        query: { limit: 100, offset },
        cache: "no-store",
      });
      items.push(...next.items);
      if (!next.hasMore || next.items.length === 0) return items;
      offset += next.items.length;
    }
  });
}
export function deleteEvent(id: number | string): Promise<void> {
  return apiRequest<void>(`/events/${id}`, { method: "DELETE" });
}

// Binary upload: PUT the raw image bytes. Can't go through apiRequest (which
// JSON-encodes), so use fetch directly. Server stores the BLOB + sets
// cover_image_url to the serving path.
export async function uploadCoverImage(
  id: number | string,
  blob: Blob,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/events/${id}/cover-image-file`, {
    method: "PUT",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!res.ok) {
    throw new ApiError(`Cover image upload failed: ${res.status}`, res.status);
  }
}

export function assignCategory(
  eventId: number | string,
  categoryId: number | string,
): Promise<unknown> {
  return apiRequest(`/events/${eventId}/categories/${categoryId}`, {
    method: "POST",
  });
}

export function removeCategory(
  eventId: number | string,
  categoryId: number | string,
): Promise<unknown> {
  return apiRequest(`/events/${eventId}/categories/${categoryId}`, {
    method: "DELETE",
  });
}
