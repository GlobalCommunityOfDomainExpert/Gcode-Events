import * as db from "./ords";
import { badRequest } from "./http";
import { requireManager } from "./access";

interface CommRow extends db.Row {
  id: number;
  event_id: number;
  subject: string;
  message: string;
  recipient_group: string;
  recipient_count: number;
  sent_on: string;
  status: string;
}

interface PartRow extends db.Row {
  id: number;
  active: string;
  email: string | null;
}

const MAX_PER_HOUR = 5;
const MAX_RECIPIENTS = 2000;

export async function listComms(eventId: number, userId: string) {
  await requireManager(eventId, userId);
  const rows = await db.list<CommRow>("portal_communications", {
    event_id: eventId,
  });
  return rows
    .sort((a, b) => b.sent_on.localeCompare(a.sent_on))
    .map((r) => ({
      id: r.id,
      event_id: r.event_id,
      subject: r.subject,
      message: r.message,
      recipient_group: r.recipient_group,
      recipient_count: r.recipient_count,
      sent_on: r.sent_on,
      status: r.status,
    }));
}

/**
 * Resolves recipients from the registrations themselves and queues the send.
 * The browser names a group (and, for CUSTOM, participant ids); it never
 * supplies a count. Nothing is emailed here: a mailer reads the QUEUED
 * recipient rows, and until it exists the log honestly says QUEUED.
 */
export async function sendComm(
  eventId: number,
  userId: string,
  input: {
    subject: string;
    message: string;
    group: string;
    participantIds: number[];
  },
) {
  await requireManager(eventId, userId);
  const { subject, message } = input;
  const group = input.group.toUpperCase();
  if (!subject || !message) throw badRequest("Add a subject and a message");
  if (!["ALL", "CONFIRMED", "CUSTOM", "PAID"].includes(group))
    throw badRequest("Unknown recipient group");
  // Payment status is not something the server can tell yet; do not guess it.
  if (group === "PAID")
    throw badRequest("Sending to paid attendees is not available yet");

  const recent = (
    await db.list<CommRow>("portal_communications", { event_id: eventId })
  ).filter((r) => Date.parse(r.sent_on) > Date.now() - 3_600_000);
  if (recent.length >= MAX_PER_HOUR)
    throw new (await import("./http")).HttpError(
      429,
      "Too many emails sent for this event. Try again in an hour",
    );

  const parts = (
    await db.list<PartRow>("portal_v_participants", { event_id: eventId })
  ).filter((p) => p.active === "Y" && p.email);
  const wanted = new Set(input.participantIds);
  // CUSTOM ids are intersected with this event's registrations, so ids from
  // another event are simply ignored.
  const chosen =
    group === "CUSTOM" ? parts.filter((p) => wanted.has(p.id)) : parts;
  if (chosen.length === 0) throw badRequest("No one to send this to");
  if (chosen.length > MAX_RECIPIENTS)
    throw badRequest(`That is more than ${MAX_RECIPIENTS} people at once`);

  const row = await db.insert<CommRow>("portal_communications", {
    event_id: eventId,
    subject,
    message,
    recipient_group: group,
    recipient_count: chosen.length,
    sent_by: userId,
  });
  if (!row.id)
    throw new Error("communication was created but its id is unknown");

  // Recipient rows in small parallel batches.
  for (let i = 0; i < chosen.length; i += 10) {
    await Promise.all(
      chosen.slice(i, i + 10).map((p) =>
        db.insert("portal_comm_recipients", {
          communication_id: row.id,
          participant_id: p.id,
          email: p.email,
        }),
      ),
    );
  }
  return {
    id: row.id,
    event_id: eventId,
    subject,
    message,
    recipient_count: chosen.length,
    sent_on: row.sent_on ?? db.ts(),
    status: "QUEUED",
  };
}
