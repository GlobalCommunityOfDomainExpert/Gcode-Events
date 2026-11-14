"use client";

import { createContext, useContext } from "react";
import { Attendee } from "@/lib/attendees";
import { Event, UpiClaim } from "@/lib/event";

export interface OrganizedEventContextValue {
  event: Event;
  attendees: Attendee[];
  refreshEvent: () => void | Promise<void>;
  refreshAttendees: () => void | Promise<void>;
  /** True until the first attendee fetch resolves (drives the table skeleton). */
  attendeesLoading: boolean;
  /** Attendee rows ticked on the Attendees section — feeds Export selected. */
  selectedAttendeeIds: Set<string>;
  setSelectedAttendeeIds: (ids: Set<string>) => void;
  /** UPI claims live here so the sidebar can badge pending ones from any section. */
  claims: UpiClaim[];
  claimsLoaded: boolean;
  refreshClaims: () => void | Promise<void>;
  /** Rounds only matter once a Participant cohort exists (see layout). */
  showRounds: boolean;
  isCancelled: boolean;
  notify: (message: string, tone?: "success" | "info" | "error") => void;
}

export const OrganizedEventContext =
  createContext<OrganizedEventContextValue | null>(null);

export function useOrganizedEvent(): OrganizedEventContextValue {
  const value = useContext(OrganizedEventContext);
  if (!value) {
    throw new Error(
      "useOrganizedEvent must be used inside the [id] layout provider",
    );
  }
  return value;
}
