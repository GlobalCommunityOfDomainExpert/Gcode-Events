import { v1Request } from "./client";
import type {
  ReviewUpiClaimBody,
  SubmitUpiClaimBody,
  UpiClaim,
} from "@/server/modules/upi-claims/upi-claims.schemas";

export type { SubmitUpiClaimBody, UpiClaim };

// /api/v1 offline UPI payment claims. Browser-only.

// Organizer review queue (admin).
export function listUpiClaims(eventId: number | string): Promise<UpiClaim[]> {
  return v1Request(`/events/${eventId}/upi-claims`);
}

// The attendee reports a payment made via the venue's UPI QR. Signed in →
// the session's name/email are used; guests pass both.
export function submitUpiClaim(
  eventId: number | string,
  body: SubmitUpiClaimBody,
): Promise<{ id: number }> {
  return v1Request(`/events/${eventId}/upi-claims`, { method: "POST", body });
}

function reviewUpiClaim(
  claimId: number | string,
  status: ReviewUpiClaimBody["status"],
): Promise<{ participantId: number | null }> {
  return v1Request(`/upi-claims/${claimId}`, {
    method: "PATCH",
    body: { status },
  });
}

// Organizer (admin): confirming registers the claimant.
export function confirmUpiClaim(claimId: number | string) {
  return reviewUpiClaim(claimId, "CONFIRMED");
}

export function rejectUpiClaim(claimId: number | string) {
  return reviewUpiClaim(claimId, "REJECTED");
}
