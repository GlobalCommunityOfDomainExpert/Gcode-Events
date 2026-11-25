import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

// Who is calling, from the bearer token the app already issues at sign-in.
// With JWT_SECRET set (the signing secret that lives in the database), the
// HS256 signature and expiry are VERIFIED. Without it the token is only
// decoded, which is exactly as trustworthy as the rest of this app. Set it.
const b64 = (s: string) =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** The verified claims of the bearer token (see the note above), or null. */
export function claimsFromRequest(
  req: NextRequest,
): Record<string, unknown> | null {
  const token = req.headers
    .get("authorization")
    ?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const [head, body, sig] = token.split(".");
  if (!head || !body) return null;
  try {
    const secret = process.env.JWT_SECRET;
    if (secret) {
      if (!sig) return null;
      const expected = createHmac("sha256", secret)
        .update(`${head}.${body}`)
        .digest();
      const given = b64(sig);
      if (given.length !== expected.length || !timingSafeEqual(given, expected))
        return null;
    }
    const payload = JSON.parse(b64(body).toString("utf8")) as Record<
      string,
      unknown
    >;
    if (typeof payload.exp === "number" && payload.exp < Date.now() / 1000)
      return null;
    return payload;
  } catch {
    return null;
  }
}

export function userFromRequest(req: NextRequest): string | null {
  const payload = claimsFromRequest(req);
  if (!payload) return null;
  // Keep ids as text: they can exceed JavaScript's safe-integer range.
  const raw = payload.userId ?? payload.user_id ?? payload.sub;
  return raw === undefined || raw === null || raw === "" ? null : String(raw);
}

/** True only for a token whose signature checked out and whose role is ADMIN. */
export function isAdminRequest(req: NextRequest): boolean {
  // Without JWT_SECRET a token is only decoded, so it proves nothing: never
  // grant admin on an unverified token.
  if (!process.env.JWT_SECRET) return false;
  return claimsFromRequest(req)?.role === "ADMIN";
}
