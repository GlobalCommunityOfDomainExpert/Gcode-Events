import z from "zod";

const eventTimelineItemSchema = z.object({
  date: z.string().default(""), // yyyy-mm-dd — enables multi-day agendas
  time: z.string(),
  endTime: z.string().default(""),
  title: z.string(),
  description: z.string(),
  location: z.string().default(""),
});

const eventSocialLinkSchema = z.object({
  platform: z.string(),
  url: z.string(),
});


const eventRoundRubricCriterionSchema = z.object({
  // Existing GCODE_EVENT_ROUND_RUBRICS.ID, null for a criterion added in
  // this edit session — lets the backend UPDATE in place instead of
  // delete+reinsert, since GCODE_EVENT_ROUND_SCORES.CRITERION_ID FKs to it
  // with NO ACTION and a delete would break once any score references it.
  id: z.number().nullable().default(null),
  label: z.string().default(""),
  maxScore: z.number().default(10),
});

const eventRoundItemSchema = z.object({
  // Existing GCODE_EVENT_ROUNDS.ID, null for a round added in this edit
  // session — same in-place-update reasoning as the criterion id above.
  id: z.number().nullable().default(null),
  name: z.string().default(""),
  description: z.string().default(""),
  mode: z.enum(["ONLINE", "OFFLINE"]).default("OFFLINE"),
  // Organizer-defined judging criteria — optional, blank = judges just
  // Shortlist/Reject with no scored breakdown.
  rubric: z.array(eventRoundRubricCriterionSchema).default([]),
  // Auto-shortlist top N once every participant has a score for every
  // rubric criterion — 0 = disabled, decisions stay fully manual.
  shortlistCount: z.number().default(0),
  date: z.string().default(""), // yyyy-mm-dd
  startTime: z.string().default(""),
  endTime: z.string().default(""),
  // Live final-score blend weights — only meaningful when both toggles below
  // are on. The step-rounds UI keeps these two summed to 100 by construction
  // (editing one sets the other to 100 - value), not enforced server-side.
  judgeWeight: z.number().default(70),
  audienceWeight: z.number().default(30),
  // Offline-round-only toggles (Online judge scoring via rubric is always
  // on, no toggle needed there). judgeScoringEnabled=true requires at least
  // one rubric criterion — enforced by the step-rounds UI before it lets the
  // wizard proceed, not by this schema. Both false = no scoring mechanism
  // for this round at all; Shortlist/Reject stays fully manual.
  judgeScoringEnabled: z.boolean().default(false),
  audienceScoringEnabled: z.boolean().default(false),
});

export const eventDetailDataSchema = z.object({
  id: z.number().default(0),
  type: z.number().nullable().default(null), // FK -> EVENT_TYPE_ID
  title: z.string().default(""),
  description: z.string().default(""),
  priceAmount: z.number().default(0),
  capacity: z.number().default(0),
  // Attendee category display text — falls back to "Attendee" + no
  // description when blank. Price/capacity for this category are the
  // priceAmount/capacity fields above (Attendee is today's default category).
  attendeeLabel: z.string().default(""),
  attendeeDescription: z.string().default(""),
  // Per-pass max-tickets-per-booking cap — 0 = no cap, only capacity applies.
  attendeeMaxTicketsPerRegistration: z.number().default(0),
  participantMaxTicketsPerRegistration: z.number().default(0),
  // Independently toggleable, same as participantRegistrationEnabled below —
  // defaults true so a new event starts open, matching today's behavior.
  attendeeRegistrationEnabled: z.boolean().default(true),
  // Participant category — a second, independent registration category
  // (e.g. hackathon builders) the organizer can opt into per event.
  participantRegistrationEnabled: z.boolean().default(false),
  participantLabel: z.string().default(""),
  participantDescription: z.string().default(""),
  participantPriceAmount: z.number().default(0),
  participantCapacity: z.number().default(0),
  categoryIds: z.array(z.number()).default([]), // FK -> EVENT_CATEGORIES.ID, via EVENT_CATEGORY_MAP
  terms: z.string().default(""), // one point per line; blank -> UI shows defaults
  eligibility: z.string().default(""), // one point per line; blank -> UI shows defaults
  mode: z.number().default(1), // FK -> MODE_OF_EVENT_ID
  date: z.string().default(""),
  time: z.string().default(""),
  location: z.string().default(""), // venue address (Physical/Hybrid)
  city: z.string().default(""), // GCODE_EVENTS2.CITY
  participationLink: z.string().default(""), // GCODE_EVENTS2.PARTICIPATION_LINK — online meeting link
  // Per-pass registration window — each category opens/closes independently.
  attendeeRegistrationOpens: z.string().default(""),
  attendeeRegistrationCloses: z.string().default(""),
  participantRegistrationOpens: z.string().default(""),
  participantRegistrationCloses: z.string().default(""),
  duration: z.string().default(""), // no backend column yet — derive from date/time later
  coverImageUrl: z.string().default(""), // local blob preview, uploaded via UPLOAD_COVER_IMAGE
  mediaUrls: z.array(z.string()).default([]), // no backend column yet
  socialLinks: z.array(eventSocialLinkSchema).default([]), // no backend column yet
  timeline: z.array(eventTimelineItemSchema).default([]), // EVENT_TIMELINE rows
  rounds: z.array(eventRoundItemSchema).default([]), // GCODE_EVENT_ROUNDS rows — contract-only as of 2026-07-25
  certificate: z.boolean().default(false), // no backend column yet
  // EVENTS.AUDIO_RECORDING_ENABLED / .AGE_CATEGORY_REQUIREMENT — gate the
  // audio/age sections on the public additional-info page. Defaults match
  // today's always-on behavior for events created before this setting existed.
  audioRecordingEnabled: z.boolean().default(true),
  ageCategoryRequirement: z.enum(["OFF", "OPTIONAL", "REQUIRED"]).default("OPTIONAL"),
  // EVENTS.TRACK_SUBMISSION_ENABLED / .MEMBER_NAMES_ENABLED — gate 2 more
  // participant-submitted sections on the additional-info page (the
  // participant adds their own track/member rows there, same as audio).
  // Brand-new opt-in features, default off.
  trackSubmissionEnabled: z.boolean().default(false),
  memberNamesEnabled: z.boolean().default(false),
});

export type EventDetailData = z.infer<typeof eventDetailDataSchema>;

export type UpdateEventDetailData = <K extends keyof EventDetailData>(
  key: K,
  value: EventDetailData[K],
) => void;

export const initialEventData: EventDetailData = eventDetailDataSchema.parse(
  {},
);
