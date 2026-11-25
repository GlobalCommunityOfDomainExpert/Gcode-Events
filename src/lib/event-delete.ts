// Who may delete an event, and when.
//  * A draft was never public: always deletable, whatever its registrations.
//  * A published event: admins only. Up to MAX_REGISTRATIONS_TO_DELETE
//    registrations is a plain delete; above that an admin can still do it, but
//    it is an explicit override (the database guard is told, and the confirm
//    dialog says how many registrations go with it).
export const MAX_REGISTRATIONS_TO_DELETE = 2;

export type DeleteRule =
  | { allowed: true; draft: boolean; override: boolean }
  | { allowed: false; reason: "not-admin" };

export function deleteRule(opts: {
  status: string;
  registrations: number;
  isAdmin: boolean;
}): DeleteRule {
  if (opts.status === "DRAFT")
    return { allowed: true, draft: true, override: false };
  if (!opts.isAdmin) return { allowed: false, reason: "not-admin" };
  return {
    allowed: true,
    draft: false,
    override: opts.registrations > MAX_REGISTRATIONS_TO_DELETE,
  };
}
