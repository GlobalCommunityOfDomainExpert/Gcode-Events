import { apiRequest } from "./client";
import { ApiListResponse } from "./types";
import { getSession } from "@/lib/auth/session";
import { CommunicationLog, RecipientGroup } from "@/lib/communications";

// GCODE_EVENT_COMMUNICATIONS (docs/sql/organizer-portal). One row per email
// blast. The browser sends the recipient GROUP, never a count: the server
// resolves who is in it and returns the real number.
interface CommunicationApi {
  id: number;
  event_id: number;
  subject: string;
  message: string;
  recipient_count: number;
  sent_on: string;
  status?: "QUEUED" | "SENT" | "FAILED";
}

const adapt = (row: CommunicationApi): CommunicationLog => ({
  id: String(row.id),
  eventId: String(row.event_id),
  subject: row.subject,
  message: row.message,
  sentAt: row.sent_on,
  recipientCount: row.recipient_count,
  status: row.status,
});

export async function listCommunications(
  eventId: number | string,
): Promise<CommunicationLog[]> {
  try {
    const { items } = await apiRequest<ApiListResponse<CommunicationApi>>(
      `/events/${eventId}/communications?actor_id=${getSession()?.userId ?? ""}`,
    );
    return items.map(adapt);
  } catch {
    return [];
  }
}

export async function sendCommunication(
  eventId: number | string,
  payload: {
    subject: string;
    message: string;
    group: RecipientGroup;
    /** Participant ids, only for the CUSTOM group. */
    participantIds?: string[];
  },
): Promise<CommunicationLog> {
  const row = await apiRequest<CommunicationApi>(
    `/events/${eventId}/communications`,
    {
      method: "POST",
      body: {
        subject: payload.subject,
        message: payload.message,
        recipient_group: payload.group,
        participant_ids:
          payload.group === "CUSTOM"
            ? (payload.participantIds ?? []).map(Number)
            : undefined,
        actor_id: getSession()?.userId ?? "",
      },
    },
  );
  return adapt(row);
}
