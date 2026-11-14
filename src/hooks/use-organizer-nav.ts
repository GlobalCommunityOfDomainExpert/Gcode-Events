"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * What the organizer sidebar needs to know about the event being managed.
 * The [id] layout publishes it; the events shell (which renders the sidebar,
 * above the page) reads it. A tiny module store avoids lifting the event
 * fetch above the router.
 */
export interface OrganizerNavEvent {
  id: string;
  title: string;
  attendeeCount: number;
  roundsCount: number;
  showRounds: boolean;
  isDraft: boolean;
  pendingClaims: number;
  /** Which type-specific sections this event needs (see lib/organizer). */
  tools?: { judging: boolean; money: boolean; checkIn: boolean };
  type?: string;
}

const toolsKey = (t: OrganizerNavEvent["tools"]) =>
  t ? `${+t.judging}${+t.money}${+t.checkIn}` : "";

let current: OrganizerNavEvent | null = null;
const listeners = new Set<() => void>();

function set(next: OrganizerNavEvent | null) {
  const same =
    current === next ||
    (current &&
      next &&
      current.id === next.id &&
      current.title === next.title &&
      current.attendeeCount === next.attendeeCount &&
      current.roundsCount === next.roundsCount &&
      current.showRounds === next.showRounds &&
      current.isDraft === next.isDraft &&
      current.pendingClaims === next.pendingClaims &&
      current.type === next.type &&
      toolsKey(current.tools) === toolsKey(next.tools));
  if (same) return;
  current = next;
  listeners.forEach((l) => l());
}

export function useOrganizerNav(): OrganizerNavEvent | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
}

/** Publish the current event for the sidebar; clears on unmount. */
export function usePublishOrganizerNav(value: OrganizerNavEvent | null) {
  const key = value
    ? `${value.id}|${value.title}|${value.attendeeCount}|${value.roundsCount}|${value.showRounds}|${value.isDraft}|${value.pendingClaims}|${value.type ?? ""}|${toolsKey(value.tools)}`
    : "";
  useEffect(() => {
    set(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => set(null), []);
}
