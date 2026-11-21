import {
  handle,
  intParam,
  jsonBody,
  requireUser,
  str,
} from "@/server/portal/http";
import { createLink, listLinks } from "@/server/portal/team";

type P = { id: string };

export const GET = handle<P>(async (req, { id }) => ({
  items: await listLinks(intParam(id), requireUser(req)),
}));

// Returns the link token once. Only its hash is stored.
export const POST = handle<P>(async (req, { id }) => {
  const b = await jsonBody(req);
  return createLink(
    intParam(id),
    requireUser(req),
    str(b.label, 120),
    str(b.role, 20),
    str(b.expiry, 12),
  );
});
