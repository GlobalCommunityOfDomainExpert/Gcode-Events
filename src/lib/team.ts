import { appUrl } from "@/lib/base-path";
// Sharing an event's dashboard with the people who help run it — a
// co-organizer, the venue, sponsors, door staff, the accountant. Two ways in:
//
//  - Invite by email: a named person with a role. Co-organizers get the full
//    organizer dashboard; everyone else gets the partner view below.
//  - View-only link: no account needed, scoped to a role, expires, can be
//    revoked any time — for "just send the sponsor the numbers".
//
// Both land on /partner/<token>, which shows only what the role allows.

export type TeamRole =
  "CO_ORGANIZER" | "VENUE_PARTNER" | "SPONSOR" | "CHECK_IN" | "FINANCE";

/** What a role can see or do in the shared dashboard. */
export type Area =
  | "overview" // registrations, capacity, days to go
  | "schedule" // run of show / agenda
  | "venue" // expected headcount per day at the venue
  | "attendees" // attendee names
  | "contacts" // attendee email + phone
  | "checkIn" // mark people as arrived
  | "money" // revenue, UPI claims, coupons
  | "edit"; // change the event, email attendees

export const AREA_LABEL: Record<Area, string> = {
  overview: "Registrations & capacity",
  schedule: "Run of show",
  venue: "Headcount per day",
  attendees: "Attendee names",
  contacts: "Emails & phone numbers",
  checkIn: "Check people in",
  money: "Revenue & payments",
  edit: "Edit event & email attendees",
};

export const ROLE_INFO: Record<
  TeamRole,
  { label: string; who: string; areas: Area[] }
> = {
  CO_ORGANIZER: {
    label: "Co-organizer",
    who: "Runs the event with you — same dashboard, same powers.",
    areas: [
      "overview",
      "schedule",
      "venue",
      "attendees",
      "contacts",
      "checkIn",
      "money",
      "edit",
    ],
  },
  VENUE_PARTNER: {
    label: "Venue partner",
    who: "The venue — headcount, live check-in count and run of show to plan staff, seating and F&B.",
    areas: ["overview", "schedule", "venue"],
  },
  SPONSOR: {
    label: "Sponsor",
    who: "Sees how the event is doing. No names, no money.",
    areas: ["overview", "schedule"],
  },
  CHECK_IN: {
    label: "Check-in staff",
    who: "Door volunteers — the guest list and a check-in button, nothing else.",
    areas: ["attendees", "checkIn"],
  },
  FINANCE: {
    label: "Finance",
    who: "Your accountant — revenue, UPI claims and coupons.",
    areas: ["overview", "money"],
  },
};

export const ROLE_ORDER: TeamRole[] = [
  "CO_ORGANIZER",
  "VENUE_PARTNER",
  "SPONSOR",
  "CHECK_IN",
  "FINANCE",
];

export const can = (role: TeamRole, area: Area) =>
  ROLE_INFO[role].areas.includes(area);

export interface TeamMember {
  id: string;
  eventId: string;
  email: string;
  name: string | null;
  role: TeamRole;
  status: "INVITED" | "ACTIVE";
  invitedOn: string;
}

export interface ShareLink {
  id: string;
  eventId: string;
  label: string;
  role: TeamRole;
  createdOn: string;
  expiresOn: string | null;
  views: number;
}

/** What a /partner/<token> link resolves to. */
export interface SharedAccess {
  eventId: string;
  role: TeamRole;
  /** The invited person's name/email, or the link's label. */
  viewer: string;
  kind: "member" | "link";
  expired: boolean;
}

/** Role-filtered numbers for a shared view. Never carries emails or phones. */
export interface SharedData {
  guests: { id: string; name: string; category: "Attendee" | "Participant" }[];
  arrivedIds: string[];
  money?: {
    pendingClaims: number;
    pendingAmount: number;
    activeCoupons: number;
  };
}

export const partnerUrl = (token: string) =>
  appUrl(`/partner/${token}`);
