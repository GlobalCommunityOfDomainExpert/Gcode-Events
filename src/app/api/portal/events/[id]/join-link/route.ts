import { handle, intParam, jsonBody } from "@/server/portal/http";
import { userFromRequest } from "@/server/portal/auth";
import { sendJoinLink } from "@/server/portal/live";

type P = { id: string };

// "Email me my join link". Works without an account (a guest just registered):
// the caller names a registration, but the link is emailed to the address on
// that registration, never to the caller, and at most once a minute.
export const POST = handle<P>(async (req, { id }) => {
  const b = await jsonBody(req);
  const pid = Number(b.participant_id);
  await sendJoinLink(
    intParam(id),
    await userFromRequest(req),
    Number.isInteger(pid) ? pid : 0,
    process.env.PUBLIC_BASE_URL ?? req.nextUrl.origin,
  );
});
