import { apiRequest } from "./client";

export function submitEventEnquiry(
  eventId: number | string,
  payload: { email: string; phone: string },
): Promise<{ ok: boolean }> {
  return apiRequest(`/events/${eventId}/enquiries`, {
    method: "POST",
    body: payload,
  });
}
