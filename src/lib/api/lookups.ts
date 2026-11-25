import { v1Request } from "./client";
import type {
  Category,
  EventMode,
  EventStatus,
  EventType,
  Lookups,
} from "@/server/modules/lookups/lookups.schemas";

export type { Category, EventMode, EventStatus, EventType };

// Browser-only. Server components should call lookupsService directly
// (src/server/modules/lookups/lookups.service.ts) instead of going over HTTP.
//
// Reference data is static for the life of the tab: one request fetches all
// four tables and every getter reads from the same cached promise.
let cache: Promise<Lookups> | null = null;

function lookups(): Promise<Lookups> {
  cache ??= v1Request<Lookups>("/lookups").catch((err) => {
    // Don't pin a failed request for the rest of the session.
    cache = null;
    throw err;
  });
  return cache;
}

export const getEventTypes = (): Promise<EventType[]> =>
  lookups().then((l) => l.eventTypes);

export const getStatuses = (): Promise<EventStatus[]> =>
  lookups().then((l) => l.statuses);

export const getModes = (): Promise<EventMode[]> =>
  lookups().then((l) => l.modes);

export const getCategories = (): Promise<Category[]> =>
  lookups().then((l) => l.categories);
