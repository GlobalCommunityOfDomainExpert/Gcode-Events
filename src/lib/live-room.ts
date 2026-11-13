import type { Event } from "@/lib/event";

// Stand-in for the wireframe's lib/webinar hasLiveRoom. The live-room /
// webinar flow isn't part of this app yet, so no event ever has one.
export function hasLiveRoom(_event: Event): boolean {
  void _event;
  return false;
}
