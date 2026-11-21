import { v1Request } from "./client";
import type { SubmitEnquiryBody } from "@/server/modules/enquiries/enquiries.schemas";

// A question for the organizer from the event page. `image` is a downscaled
// data URL (screenshot/photo picked from the device).
export function submitEventEnquiry(
  eventId: number | string,
  payload: SubmitEnquiryBody,
): Promise<void> {
  return v1Request(`/events/${eventId}/enquiries`, {
    method: "POST",
    body: payload,
  });
}
