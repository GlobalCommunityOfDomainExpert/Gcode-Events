import type { Event } from "@/lib/event";
import { LIVE_ROOM_ENABLED } from "@/lib/feature-flags";

// Does this event run a GCODE live room? An Online event does (once the
// feature is on) unless the organizer gave their own meeting link: an empty
// link means "use the GCODE room", a link means "join there". Hybrid events
// decide per day in Agenda (a day with no link uses the room).
export function hasLiveRoom(event: Event): boolean {
  if (!LIVE_ROOM_ENABLED) return false;
  return event.mode === "Online" && !event.participationLink?.trim();
}
