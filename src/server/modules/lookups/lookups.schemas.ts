import { z } from "zod";

// API contract for reference data. Shared by the route (server) and
// src/lib/api/lookups.ts (browser), so no "server-only" here.

export const eventTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
});

export const eventStatusSchema = z.object({
  id: z.number(),
  // Stable machine value the UI branches on: DRAFT, OPEN, CANCELLED, …
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

export const eventModeSchema = z.object({
  id: z.number(),
  // PHYSICAL | ONLINE | HYBRID (MODE_OF_EVENTS.MODE_NAME holds codes)
  code: z.string(),
  description: z.string().nullable(),
});

export const categorySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
});

export type EventType = z.infer<typeof eventTypeSchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type EventMode = z.infer<typeof eventModeSchema>;
export type Category = z.infer<typeof categorySchema>;

export interface Lookups {
  eventTypes: EventType[];
  statuses: EventStatus[];
  modes: EventMode[];
  categories: Category[];
}

export const LOOKUP_KINDS = [
  "event-types",
  "statuses",
  "modes",
  "categories",
] as const;

export const lookupKindSchema = z.enum(LOOKUP_KINDS);
export type LookupKind = z.infer<typeof lookupKindSchema>;
