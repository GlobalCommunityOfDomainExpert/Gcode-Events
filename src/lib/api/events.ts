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
