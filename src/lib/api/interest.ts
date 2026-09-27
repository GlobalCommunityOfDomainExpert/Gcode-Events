import { apiRequest } from "./client";

// "I'm Interested" — one row per (event, email), repeat calls are a no-op.
// Signed-in users send user_id (kept a string, ids are 30-40 digits) and
// skip the phone field entirely — no popup for them at all. Guests send an
// email that must already have passed the guest OTP (sendGuestOtp +
// verifyOtp) plus a phone number, regex-validated client-side only — the
// server stores it as-is, no OTP/verification on the phone itself.
export function expressInterest(
  eventId: number | string,
  identity: { userId: string } | { email: string; phone: string },
): Promise<{ ok: boolean }> {
  return apiRequest(`/events/${eventId}/interest`, {
    method: "POST",
    body:
      "userId" in identity
        ? { user_id: identity.userId }
        : { email: identity.email, phone: identity.phone },
  });
}
