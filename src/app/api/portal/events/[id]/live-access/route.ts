import { handle, intParam } from "@/server/portal/http";
import { userFromRequest } from "@/server/portal/auth";
import { liveAccess } from "@/server/portal/live";

type P = { id: string };

// Works signed out too: the door and the event page still show the countdown
// and the organizer notice, with registered = false.
export const GET = handle<P>(async (req, { id }) =>
  liveAccess(
    intParam(id),
    await userFromRequest(req),
    req.nextUrl.searchParams.get("t"),
  ),
);
