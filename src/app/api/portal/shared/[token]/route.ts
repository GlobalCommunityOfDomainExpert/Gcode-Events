import { handle } from "@/server/portal/http";
import { sharedAccess } from "@/server/portal/team";

// Read only: opening this must change nothing (see ./open).
export const GET = handle<{ token: string }>(async (_req, { token }) =>
  sharedAccess(token),
);
