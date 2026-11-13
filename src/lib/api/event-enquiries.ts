import { apiRequest } from "./client";

// A question for the organizer from the event page. `message`/`topic`/`image`
// are contract-only — the live handler stores email + phone today; it should
// keep accepting the old shape until it adds the columns. `image` is a
// downscaled data URL (screenshot/photo picked from the device), max ~1200px.
export function submitEventEnquiry(
  eventId: number | string,
  payload: {
    email: string;
    phone?: string;
    message: string;
    topic?: string;
    image?: string;
  },
): Promise<{ ok: boolean }> {
  return apiRequest(`/events/${eventId}/enquiries`, {
    method: "POST",
    body: payload,
  });
}
