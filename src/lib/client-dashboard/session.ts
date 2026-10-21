import { createHmac, timingSafeEqual } from "node:crypto";
import { CLIENT_DASHBOARD_SECRET } from "./config";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export function cookieName(eventId: string): string {
  return `client_dash_${eventId}`;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// Cookie value: `<eventId>.<expiresAtMs>.<hmac>`. Bound to the event so a
// cookie for one dashboard can't open another.
export function createSessionValue(
  eventId: string,
  now = Date.now(),
  secret = CLIENT_DASHBOARD_SECRET,
): string {
  const payload = `${eventId}.${now + SESSION_MAX_AGE_SECONDS * 1000}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionValue(
  value: string | undefined,
  eventId: string,
  now = Date.now(),
  secret = CLIENT_DASHBOARD_SECRET,
): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [id, expires, mac] = parts;
  if (id !== eventId || !(Number(expires) > now)) return false;
  const expected = Buffer.from(sign(`${id}.${expires}`, secret));
  const actual = Buffer.from(mac);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
