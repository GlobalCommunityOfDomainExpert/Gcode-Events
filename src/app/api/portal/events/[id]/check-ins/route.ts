import { handle, intParam, jsonBody } from "@/server/portal/http";
import { userFromRequest } from "@/server/portal/auth";
import { listCheckIns, setCheckIn } from "@/server/portal/team";

type P = { id: string };

// A manager signs in; door staff can instead pass a CHECK_IN link or invite token.
export const GET = handle<P>(async (req, { id }) => ({
  items: await listCheckIns(
    intParam(id),
    userFromRequest(req),
    req.nextUrl.searchParams.get("token"),
  ),
}));

export const POST = handle<P>(async (req, { id }) => {
  const b = await jsonBody(req);
  await setCheckIn(
    intParam(id),
    userFromRequest(req),
    typeof b.token === "string" ? b.token : null,
    intParam(String(b.participant_id), "participant"),
    b.arrived === true || b.arrived === "true",
  );
});
