import { handle, intParam, jsonBody } from "@/server/portal/http";
import { userFromRequest } from "@/server/portal/auth";
import { joinCredential } from "@/server/portal/live";

type P = { id: string };

// A signed-in account, or the signed join link from the registration email
// (body.t). joinCredential refuses when neither identifies a ticket holder.
export const POST = handle<P>(async (req, { id }) => {
  const b = await jsonBody(req);
  return joinCredential(
    intParam(id),
    await userFromRequest(req),
    typeof b.t === "string" ? b.t : null,
  );
});
