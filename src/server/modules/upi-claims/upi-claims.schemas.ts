import { z } from "zod";

// API contract for offline UPI payment claims. Shared with
// src/lib/api/upi-claims.ts.
//
// A claim is self-reported (the attendee paid a static UPI QR and quotes the
// UTR), not proof of payment: an organizer checks it against their bank and
// confirms — which registers the attendee — or rejects it.

export type UpiClaimStatus = "PENDING" | "CONFIRMED" | "REJECTED";

// Organizer's review queue (admin).
export interface UpiClaim {
  id: number;
  eventId: number;
  email: string;
  fullName: string;
  utr: string;
  amountClaimed: number;
  status: UpiClaimStatus;
  submittedOn: string;
  reviewedBy: string | null;
  reviewedOn: string | null;
  participantId: number | null;
}

export const upiClaimIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// POST /api/v1/events/:id/upi-claims (public). Signed in → the session's
// name and email are used; guest → both required.
export const submitUpiClaimSchema = z.object({
  email: z.email().max(255).optional(),
  fullName: z.string().trim().min(1).max(255).optional(),
  // UPI reference numbers are 12 digits; banks vary, so allow some slack.
  utr: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9]{6,30}$/,
      "Enter the UTR exactly as your UPI app shows it",
    ),
  amountClaimed: z.number().min(0).max(99_999_999),
});

export type SubmitUpiClaimBody = z.infer<typeof submitUpiClaimSchema>;

// PATCH /api/v1/upi-claims/:id (admin). Confirming registers the claimant
// (one ATTENDEE ticket) and sends the usual confirmation email.
export const reviewUpiClaimSchema = z.object({
  status: z.enum(["CONFIRMED", "REJECTED"]),
});

export type ReviewUpiClaimBody = z.infer<typeof reviewUpiClaimSchema>;
