import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/** 256 bits from the OS CSPRNG, hex. Shown to the user once, never stored. */
export const newToken = () => randomBytes(32).toString("hex");

/** What the database keeps instead of the token. */
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

// ---- Join link token (guests have no account) ------------------------------
// A token proves one registration may join one event: `<participant>.<expiry>.
// <signature>`. The signature covers the event too, so a token for one event is
// useless at another, and it expires, so a link left in an inbox stops working.
function joinSecret(): string {
  const s = process.env.JOIN_LINK_SECRET ?? process.env.ORDS_PORTAL_KEY;
  if (!s) throw new Error("JOIN_LINK_SECRET (or ORDS_PORTAL_KEY) is not set");
  return s;
}

const joinSig = (eventId: number, participantId: number, exp: number) =>
  createHmac("sha256", joinSecret())
    .update(`join|${eventId}|${participantId}|${exp}`)
    .digest("base64url");

export function signJoinToken(
  eventId: number,
  participantId: number,
  expiresAtMs: number,
): string {
  const exp = Math.floor(expiresAtMs / 1000);
  return `${participantId}.${exp}.${joinSig(eventId, participantId, exp)}`;
}

/** The participant id a valid, unexpired token stands for, or 0. */
export function readJoinToken(eventId: number, token: string | null): number {
  const m = token?.match(/^(\d{1,15})\.(\d{1,12})\.([A-Za-z0-9_-]{20,64})$/);
  if (!m) return 0;
  const pid = Number(m[1]);
  const exp = Number(m[2]);
  if (exp < Date.now() / 1000) return 0;
  const want = Buffer.from(joinSig(eventId, pid, exp));
  const got = Buffer.from(m[3]);
  return want.length === got.length && timingSafeEqual(want, got) ? pid : 0;
}
