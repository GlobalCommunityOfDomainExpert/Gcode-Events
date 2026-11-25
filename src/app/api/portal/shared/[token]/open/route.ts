import { handle } from "@/server/portal/http";
import { userFromRequest } from "@/server/portal/auth";
import { openShared } from "@/server/portal/team";

// Counts a link view or activates an invite. A co-organizer invite needs the
// caller signed in; view-only roles open it anonymously.
export const POST = handle<{ token: string }>(async (req, { token }) => {
  await openShared(token, await userFromRequest(req));
});
