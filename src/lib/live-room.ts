import type { Event } from "@/lib/event";
import { LIVE_ROOM_ENABLED } from "@/lib/feature-flags";

// Does this event run a GCODE live room? Online events always do (once the
// feature is on). Hybrid events only when the server says so; the API has no
// live-room flag yet, so hybrids stay off until it does (Handover 7, D3).
export function hasLiveRoom(event: Event): boolean {
  if (!LIVE_ROOM_ENABLED) return false;
  return event.mode === "Online";
}
