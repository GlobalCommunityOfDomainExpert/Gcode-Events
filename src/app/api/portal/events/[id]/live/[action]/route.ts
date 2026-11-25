import { handle, intParam, jsonBody, requireUser } from "@/server/portal/http";
import { badRequest } from "@/server/portal/http";
import { hostAction, type HostAction } from "@/server/portal/live";

type P = { id: string; action: string };

const ACTIONS: HostAction[] = [
  "go-live",
  "stop",
  "record",
  "captions",
  "notice",
  "end",
];

export const POST = handle<P>(async (req, { id, action }) => {
  if (!ACTIONS.includes(action as HostAction))
    throw badRequest("Unknown action");
  const b = await jsonBody(req);
  await hostAction(
    intParam(id),
    await requireUser(req),
    action as HostAction,
    b,
    process.env.PUBLIC_BASE_URL ?? req.nextUrl.origin,
  );
});
