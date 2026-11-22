import {
  handle,
  intParam,
  jsonBody,
  requireUser,
  str,
} from "@/server/portal/http";
import { listComms, sendComm } from "@/server/portal/comm";

type P = { id: string };

export const GET = handle<P>(async (req, { id }) => ({
  items: await listComms(intParam(id), requireUser(req)),
}));

// The browser names a recipient group; any recipient_count it sends is ignored.
export const POST = handle<P>(async (req, { id }) => {
  const b = await jsonBody(req);
  const ids = Array.isArray(b.participant_ids)
    ? b.participant_ids.map(Number).filter(Number.isInteger)
    : [];
  return sendComm(intParam(id), requireUser(req), {
    subject: str(b.subject, 200),
    message: str(b.message, 4000),
    group: str(b.recipient_group, 12),
    participantIds: ids,
  });
});
