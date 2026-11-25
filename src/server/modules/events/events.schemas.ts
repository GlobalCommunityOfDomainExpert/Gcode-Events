import { z } from "zod";
import { eventDetailDataSchema } from "@/lib/zod/event";

// API contract for /api/v1/events: public reads and organizer writes.
// Shared with src/lib/api/events.ts.
//
// Defaults the old ORDS consumers applied by hand ("missing column → enabled",
// "1"/1 numbers, JSON arrays as strings) are resolved server-side: every field
// here is present, typed, and null only when it genuinely has no value.

// One row of the public/organizer event list.
export interface EventSummary {
  id: number;
  title: string;
  eventTypeId: number;
  modeOfEventId: number;
  statusId: number;
  city: string | null;
  address: string | null;
  startDate: string | null;
  endDate: string | null;
  maxAttendees: number | null;
  ticketPrice: number;
  isFeatured: boolean;
  coverImageUrl: string | null;
  // 16:7 image for cards and the phone event page; null = use the cover.
  cardImageUrl: string | null;
  bannerImageUrl: string | null;
  participationLink: string | null;
  // Every active registration (both categories). On EventDetail it counts
  // the ATTENDEE category only — the two endpoints have always differed.
  registeredCount: number;
}

export type RatingMode = "COMPETITIVE" | "CASUAL";
export type RegistrationCategoryCode = "ATTENDEE" | "PARTICIPANT";

export interface EventDetail extends EventSummary {
  summary: string | null;
  description: string | null;
  durationText: string | null;
  terms: string | null;
  eligibility: string | null;
  // Hybrid events' day/stage plan, as stored (JSON array string).
  stagesJson: string | null;
  certificateOffered: boolean;

  organizerId: string | null;
  organizerName: string | null;
  createdBy: string | null;
  createdOn: string | null;
  updatedBy: string | null;
  updatedOn: string | null;

  categoryIds: number[];
  categoryNames: string[];
  interestedCount: number;

  // ATTENDEE category (price/capacity are ticketPrice/maxAttendees above).
  attendeeRegistrationEnabled: boolean;
  attendeeLabel: string | null;
  attendeeDescription: string | null;
  registrationStart: string | null;
  registrationDeadline: string | null;
  maxTicketsPerRegistration: number | null;

  // PARTICIPANT category.
  participantRegistrationEnabled: boolean;
  participantLabel: string | null;
  participantDescription: string | null;
  participantPrice: number | null;
  participantCapacity: number | null;
  participantRegisteredCount: number;
  participantRegistrationStart: string | null;
  participantRegistrationDeadline: string | null;
  participantMaxTicketsPerRegistration: number | null;

  ratingMode: RatingMode;
  audioRecordingEnabled: boolean;
  audioRecordingAppliesTo: RegistrationCategoryCode;
}

export interface EventTimelineEntry {
  title: string;
  description: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  // Organizer's name for this entry's day; null → "Day N".
  dayLabel: string | null;
  sortOrder: number;
}

export interface EventFaq {
  question: string;
  answer: string;
  sortOrder: number;
}

export interface EventMediaItem {
  url: string;
  sortOrder: number;
}

export interface EventSocialLink {
  platform: string;
  url: string;
}

// GCODE_EVENT_PARTNERS: brands shown with the organizer ("Powered by …").
export interface EventPartnerItem {
  name: string;
  role: string;
  logoUrl: string | null;
  url: string | null;
  about: string | null;
  sortOrder: number;
}

const optionalId = z.coerce.number().int().positive().optional();

export const listEventsQuerySchema = z.object({
  featured: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  typeId: optionalId,
  modeId: optionalId,
  statusId: optionalId,
  categoryId: optionalId,
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
// What callers may pass (paging is handled by the client helper).
export interface EventFilters {
  featured?: boolean;
  typeId?: number;
  modeId?: number;
  statusId?: number;
  categoryId?: number;
  search?: string;
}

export const eventIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// ── Writes (organizer, admin-only) ───────────────────────────────────────

// POST /api/v1/events and PUT /api/v1/events/:id: the editor's whole draft.
// The server turns it into the event row plus every child collection and
// saves them in one transaction.
export const saveEventBodySchema = z.object({
  draft: eventDetailDataSchema,
  statusId: z.number().int().positive().optional(),
});

export type SaveEventBody = z.infer<typeof saveEventBodySchema>;

export interface SaveEventResult {
  id: number;
}

// PATCH /api/v1/events/:id: single settings flipped from the organizer's
// event page. Omitted fields are left unchanged.
export const patchEventSchema = z
  .object({
    statusId: z.number().int().positive(),
    ratingMode: z.enum(["COMPETITIVE", "CASUAL"]),
    attendeeRegistrationEnabled: z.boolean(),
    participantRegistrationEnabled: z.boolean(),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "Nothing to update");

export type PatchEventBody = z.infer<typeof patchEventSchema>;
