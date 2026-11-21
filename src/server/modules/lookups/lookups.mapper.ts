import "server-only";
import type {
  CategoryRow,
  EventModeRow,
  EventStatusRow,
  EventTypeRow,
} from "./lookups.repository";
import type {
  Category,
  EventMode,
  EventStatus,
  EventType,
} from "./lookups.schemas";

export const toEventType = (r: EventTypeRow): EventType => ({
  id: r.id,
  name: r.name,
  description: r.description ?? null,
});

export const toEventStatus = (r: EventStatusRow): EventStatus => ({
  id: r.id,
  code: r.status_code,
  name: r.status_name,
  description: r.description ?? null,
});

export const toEventMode = (r: EventModeRow): EventMode => ({
  id: r.id,
  code: r.mode_name,
  description: r.description ?? null,
});

export const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.category_name,
  description: r.description ?? null,
});
