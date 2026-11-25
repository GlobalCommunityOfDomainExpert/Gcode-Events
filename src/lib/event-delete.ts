// Who may delete an event, and when. Drafts were never public, so deleting
// one is always fine. A published event can only be deleted by a GCODE admin,
// and only while it has at most MAX_REGISTRATIONS_TO_DELETE registrations;
// past that, cancel it instead so attendees are not silently dropped.
export const MAX_REGISTRATIONS_TO_DELETE = 2;

export type DeleteRule =
  | { allowed: true; draft: boolean }
  | { allowed: false; reason: "not-admin" | "has-registrations" };

export function deleteRule(opts: {
  status: string;
  registrations: number;
  isAdmin: boolean;
}): DeleteRule {
  if (opts.status === "DRAFT") return { allowed: true, draft: true };
  if (!opts.isAdmin) return { allowed: false, reason: "not-admin" };
  if (opts.registrations > MAX_REGISTRATIONS_TO_DELETE)
    return { allowed: false, reason: "has-registrations" };
  return { allowed: true, draft: false };
}
