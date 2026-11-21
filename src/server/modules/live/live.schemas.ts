import { z } from "zod";

// API contract for running an event live: who's on stage, the audience
// rating window, and anonymous emoji reactions. Shared with
// src/lib/api/live.ts.

// GET /api/v1/events/:id/live-state (public; also streamed).
export interface LiveState {
  participantId: number | null;
  participantName: string | null;
  // Only when ?attendeeId= is given: has this attendee rated the current
  // performer already (the lock survives a page refresh).
  alreadyRated: boolean;
  // When the audience rating window for the current performer closes;
  // null until the organizer opens it.
  windowClosesAt: string | null;
  // Average so far, out of 100 (mean of 0–10 ratings × 10); null before
  // the first rating.
  avgRating: number | null;
  ratingCount: number;
  roundId: number | null;
  // Intermission: the scoreboard shows only the logo.
  isIntermission: boolean;
}

export interface PerformedParticipant {
  participantId: number;
  performedAt: string;
}

export interface RoundRatingSummary {
  participantId: number;
  avgRating: number; // out of 100
  ratingCount: number;
}

export interface Reaction {
  id: number;
  emoji: string;
}

// Fixed set — must match GCODE_RATINGS_API.submit_reaction's check.
export const REACTION_EMOJIS = ["👏", "🔥", "❤️", "😂", "👍"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const liveStateQuerySchema = z.object({
  attendeeId: z.coerce.number().int().positive().optional(),
});

// PUT /api/v1/events/:id/live-state/performer (admin) — brings a
// Participant-category entry on stage (the rating window stays closed).
export const setPerformerSchema = z.object({
  participantId: z.number().int().positive(),
  roundId: z.number().int().positive().optional(),
});

// PUT /api/v1/events/:id/live-state/intermission (admin).
export const setIntermissionSchema = z.object({ active: z.boolean() });

// POST /api/v1/participants/:id/ratings — :id is the rater's Attendee
// registration (from their rating link).
export const submitRatingSchema = z.object({
  performerId: z.number().int().positive(),
  rating: z.number().min(0).max(10),
});

export const roundRatingsQuerySchema = z.object({
  roundId: z.coerce.number().int().positive(),
});

// POST /api/v1/events/:id/reactions (public, anonymous). The device token
// only ties one browser's taps together for the 1-per-second throttle.
export const submitReactionSchema = z.object({
  performerId: z.number().int().positive(),
  emoji: z.enum(REACTION_EMOJIS),
  deviceToken: z.string().min(8).max(100),
});

export const reactionsStreamQuerySchema = z.object({
  performerId: z.coerce.number().int().positive().optional(),
});
