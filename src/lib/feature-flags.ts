// Handover 7 ships behind flags. Both default off, so nothing about the live
// room, Communication or Team & access is visible until the backend for it
// exists and the flag is switched on (NEXT_PUBLIC_* is inlined at build time).

/** Webinar live room: organizer page, attendee door, join panel. */
export const LIVE_ROOM_ENABLED = process.env.NEXT_PUBLIC_LIVE_ROOM === "true";

/** Organizer portal extras: Communication, Team & access, share links. */
export const ORGANIZER_PORTAL_ENABLED =
  process.env.NEXT_PUBLIC_ORGANIZER_PORTAL === "true";
