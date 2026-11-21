import { handle, intParam, jsonBody, requireUser } from "@/server/portal/http";
import { removeFromRoom } from "@/server/portal/live";

type P = { id: string };

export const POST = handle<P>(async (req, { id }) => {
  const b = await jsonBody(req);
  await removeFromRoom(
    intParam(id),
    requireUser(req),
    intParam(String(b.registration_id), "registration"),
  );
});
