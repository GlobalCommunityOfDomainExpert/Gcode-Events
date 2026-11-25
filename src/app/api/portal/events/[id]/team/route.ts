import {
  handle,
  intParam,
  jsonBody,
  requireUser,
  str,
} from "@/server/portal/http";
import { inviteMember, listTeam } from "@/server/portal/team";

type P = { id: string };

export const GET = handle<P>(async (req, { id }) => ({
  items: await listTeam(intParam(id), await requireUser(req)),
}));

// Returns the invite token once. Only its hash is stored.
export const POST = handle<P>(async (req, { id }) => {
  const b = await jsonBody(req);
  return inviteMember(
    intParam(id),
    await requireUser(req),
    str(b.email, 255),
    str(b.role, 20),
  );
});
