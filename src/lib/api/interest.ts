import { v1Request } from "./client";
import type { ExpressInterestBody } from "@/server/modules/interest/interest.schemas";

// "I'm Interested" — one row per (event, email), repeat calls are a no-op.
// Signed in → the server uses the session's account; pass nothing. Guests
// pass an email that has just passed the guest OTP (sendGuestOtp +
// verifyOtp) and, optionally, a phone (format-checked only).
export function expressInterest(
  eventId: number | string,
  guest?: ExpressInterestBody,
): Promise<void> {
  return v1Request(`/events/${eventId}/interest`, {
    method: "POST",
    body: guest ?? {},
  });
}
