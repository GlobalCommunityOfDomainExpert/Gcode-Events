import { apiRequest } from "./client";

// "I'm Interested" — one row per (event, email), repeat calls are a no-op.
// Signed-in users send user_id (kept a string, ids are 30-40 digits); guests
// send an email that must already have passed the guest OTP
// (sendGuestOtp + verifyOtp) — the server rejects unverified emails.
export function expressInterest(
  eventId: number | string,
  identity: { userId: string } | { email: string },
): Promise<{ ok: boolean }> {
  return apiRequest(`/events/${eventId}/interest`, {
    method: "POST",
    body:
      "userId" in identity
        ? { user_id: identity.userId }
        : { email: identity.email },
  });
}
