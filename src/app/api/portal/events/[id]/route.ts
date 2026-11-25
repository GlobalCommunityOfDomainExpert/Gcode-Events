import { handle, intParam, requireUser } from "@/server/portal/http";
import { isAdminRequest } from "@/server/portal/auth";
import { deleteEventAs } from "@/server/portal/event-delete";

type P = { id: string };

// DELETE /api/portal/events/:id. The admin check uses the verified token.
export const DELETE = handle<P>(async (req, { id }) => {
  await deleteEventAs(intParam(id), requireUser(req), isAdminRequest(req));
});
