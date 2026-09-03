export type AttendeeRole =
  "Fresher" | "Startup Founder" | "Domain Expert" | "Institution" | "Guest";
export type AttendanceStatus =
  "registered" | "attended" | "missed" | "cancelled";

export interface Attendee {
  id: string;
  eventId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarInitials: string;
  role: AttendeeRole;
  ticketType: "Free" | "Paid";
  quantity?: number; // ticket count for this registration; unset defaults to 1
  amountPaid?: number;
  status: AttendanceStatus;
  registeredAt: string;
  category: "Attendee" | "Participant";
  // Only ever set for category "Participant" — Attendee passes have no
  // additional-info submission step.
  audioSubmissionUrl?: string | null;
  audioSubmittedOn?: string | null;
  // Only ever set for category "Participant" — same additional-info step as
  // the audio submission above.
  ageCategory?: "YOUNGSTER" | "ADULT" | "SENIOR" | null;
}

// Matches additional-info/page.tsx's own 24h window — kept as a separate
// constant here since that page computes its own live countdown and this
// one just needs a point-in-time status for the organizer's table.
export const AUDIO_SUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SubmissionStatus = "submitted" | "pending" | "disqualified";

// undefined -> not a Participant-category row, or the event doesn't have
// audio recording enabled — submission concept doesn't apply either way.
// registrationDeadlineIso is the event's participantRegistration close time —
// the submission window is 24h after that, not 24h after this attendee's own
// registeredAt. Falls back to registeredAt if the organizer hasn't set a
// participant registration deadline. audioRecordingEnabled defaults true so
// existing callers that haven't been updated for the per-event toggle keep
// today's behavior.
export function audioSubmissionStatus(
  attendee: Attendee,
  registrationDeadlineIso: string | null | undefined,
  audioRecordingEnabled: boolean = true,
  now: Date = new Date(),
): SubmissionStatus | undefined {
  if (attendee.category !== "Participant") return undefined;
  if (!audioRecordingEnabled) return undefined;
  if (attendee.audioSubmissionUrl) return "submitted";
  const closesAt = registrationDeadlineIso ?? attendee.registeredAt;
  const deadline = new Date(closesAt).getTime() + AUDIO_SUBMISSION_WINDOW_MS;
  return now.getTime() > deadline ? "disqualified" : "pending";
}

// A submission URL is either something we uploaded to OCI Object Storage
// ourselves (audio file, upload/record modes) or a participant-hosted
// external link (Google Drive/YouTube/etc., link mode) — same field either
// way (see the audioSubmissionUrl comment above). Client-safe check by
// hostname pattern only, no bucket name/credentials involved — the
// server-only equivalent (src/lib/oci/object-storage.ts's
// isOwnAudioObjectUrl) does the real validation before actually fetching
// anything.
export function isUploadedAudioUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".oraclecloud.com");
  } catch {
    return false;
  }
}

export function attendeesCsvRows(attendees: Attendee[]): string[][] {
  return attendees.map((attendee) => [
    attendee.name,
    attendee.email,
    attendee.role,
    attendee.category,
    new Date(attendee.registeredAt).toLocaleDateString("en-IN"),
    attendee.ticketType,
    String(attendee.quantity ?? 1),
    attendee.status,
  ]);
}

export const ATTENDEES_CSV_HEADERS = [
  "Name",
  "Email",
  "Role",
  "Category",
  "Registered",
  "Payment",
  "Tickets",
  "Status",
];
