import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  isAdmin,
  verifySession,
  type SessionUser,
} from "@/server/auth/session";

// Who is calling: the app's own login session, the httpOnly `gcode_session`
// cookie set by /api/v1/auth. The portal routes share it, so there is no
// second token and no header to forward. The signature and expiry are verified
// on every call (AUTH_SECRET); a missing or bad cookie is "not signed in".

/** The verified session of the caller, or null. */
export async function sessionFromRequest(
  req: NextRequest,
): Promise<SessionUser | null> {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

/** The caller's user id as text (ids can exceed JavaScript's safe integers). */
export async function userFromRequest(
  req: NextRequest,
): Promise<string | null> {
  return (await sessionFromRequest(req))?.userId ?? null;
}

/** True only for a verified session whose role is ADMIN. */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  return isAdmin(await sessionFromRequest(req));
}
