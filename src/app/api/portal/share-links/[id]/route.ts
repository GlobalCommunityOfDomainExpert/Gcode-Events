import { handle, intParam, requireUser } from "@/server/portal/http";
import { revokeLink } from "@/server/portal/team";

type P = { id: string };

export const DELETE = handle<P>(async (req, { id }) => {
  await revokeLink(intParam(id), requireUser(req));
});
