import {
  handle,
  intParam,
  jsonBody,
  requireUser,
  str,
} from "@/server/portal/http";
import { removeMember, setMemberRole } from "@/server/portal/team";

type P = { id: string };

export const PUT = handle<P>(async (req, { id }) => {
  const b = await jsonBody(req);
  await setMemberRole(intParam(id), await requireUser(req), str(b.role, 20));
});

export const DELETE = handle<P>(async (req, { id }) => {
  await removeMember(intParam(id), await requireUser(req));
});
