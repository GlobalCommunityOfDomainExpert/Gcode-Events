import { createHmac, createPublicKey, verify } from "node:crypto";

// The video provider, behind one thin adapter (Handover 7, D16). Only what
// every Prebuilt provider does the same way is abstracted; in-room layout,
// chat, raise hand and bring-on-stage belong to the provider's own room.
//
// VideoSDK is the pilot. Every request below follows its public REST docs but
// has NOT been run against a real account: the spike (Part 0b) must prove the
// room, HLS, recording, end and remove calls, the join token and the webhook
// signature before any attendee relies on them. Until the VIDEOSDK_* env vars
// are set, every call fails with a clear "not configured" error.

export type OurRole = "host" | "speaker" | "attendee";

export interface ProviderCapabilities {
  pause: boolean;
  notice: boolean;
  captions: boolean;
  restream: boolean;
}

const BASE = "https://api.videosdk.live/v2";

function creds() {
  const key = process.env.VIDEOSDK_API_KEY;
  const secret = process.env.VIDEOSDK_API_SECRET ?? process.env.VIDEOSDK_SECRET;
  if (!key || !secret) throw new Error("The video provider is not configured");
  return { key, secret };
}

const b64u = (b: Buffer | string) =>
  Buffer.from(b)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

/** HS256 JWT, signed with the provider secret (never leaves the server). */
function sign(claims: Record<string, unknown>): string {
  const { secret } = creds();
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(claims));
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest();
  return `${head}.${body}.${b64u(sig)}`;
}

/** Token for our own REST calls. */
function apiToken(): string {
  const { key } = creds();
  const now = Math.floor(Date.now() / 1000);
  return sign({
    apikey: key,
    permissions: ["allow_join", "allow_mod"],
    version: 2,
    iat: now,
    exp: now + 600,
  });
}

async function rest<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: apiToken(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(
      `Provider ${path} failed (${res.status}): ${text.slice(0, 200)}`,
    );
  return (text ? JSON.parse(text) : {}) as T;
}

export const capabilities = (): ProviderCapabilities => ({
  // Shown only when proven by the spike: nothing is advertised on a guess.
  pause: false,
  notice: true,
  captions: false,
  restream: false,
});

export async function createRoom(): Promise<string> {
  const r = await rest<{ roomId: string }>("/rooms", {});
  if (!r.roomId) throw new Error("The provider did not return a room");
  return r.roomId;
}

/**
 * A short-lived credential tied to one person. The token carries only
 * allow_join / allow_mod (host); viewer vs conference is a client-side mode,
 * so the server still decides who gets a token at all. participantId is the
 * registration id, so a forwarded link gets nobody in.
 */
export function credentialFor(
  roomId: string,
  role: OurRole,
  participantId: string,
  ttlSeconds: number,
): string {
  const { key } = creds();
  const now = Math.floor(Date.now() / 1000);
  return sign({
    apikey: key,
    // Proven in the spike: allow_mod alone cannot join, so the host needs both.
    permissions: role === "host" ? ["allow_join", "allow_mod"] : ["allow_join"],
    version: 2,
    roomId,
    participantId,
    iat: now,
    exp: now + ttlSeconds,
  });
}

/**
 * Starts HLS and returns the watch URL. Proven in the spike: the response
 * carries playbackHlsUrl at once, and the CDN serves it with no token or
 * expiry, so the URL is a secret: only the server may hand it out.
 */
export async function startStream(
  roomId: string,
  webhookUrl: string,
): Promise<string> {
  const r = await rest<{ playbackHlsUrl?: string }>("/hls/start", {
    roomId,
    webhookUrl,
  });
  if (!r.playbackHlsUrl)
    throw new Error("The provider did not return a stream");
  return r.playbackHlsUrl;
}
// The stop path is /hls/end (the spike got 404 on /hls/stop).
export const stopStream = (roomId: string) => rest("/hls/end", { roomId });
export const startRecording = (roomId: string, webhookUrl: string) =>
  rest("/recordings/start", { roomId, webhookUrl });
export const stopRecording = (roomId: string) =>
  rest("/recordings/stop", { roomId });
export const removePerson = (roomId: string, participantId: string) =>
  rest("/sessions/participants/remove", { roomId, participantId });
export const endRoom = (roomId: string) => rest("/sessions/end", { roomId });

let publicKey: string | null = null;

/**
 * Checks the provider's RSA-SHA256 signature against the RAW request body (not
 * a re-serialised copy: the bytes must be the ones that were signed). The
 * signature encoding is not documented; base64 and hex are both accepted.
 */
export async function verifyWebhook(
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;
  try {
    if (!publicKey) {
      const r = await fetch(`${BASE}/public/rsa-public-key`, {
        headers: { Authorization: apiToken() },
        cache: "no-store",
      });
      if (!r.ok) return false;
      const t = (await r.text()).trim();
      publicKey = t.startsWith("{")
        ? ((JSON.parse(t) as { publicKey?: string; data?: string }).publicKey ??
          (JSON.parse(t) as { data?: string }).data ??
          "")
        : t;
    }
    const key = createPublicKey(publicKey);
    const data = Buffer.from(rawBody, "utf8");
    for (const enc of ["base64", "hex"] as const) {
      const sig = Buffer.from(signature, enc);
      if (sig.length && verify("RSA-SHA256", data, key, sig)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Our five events plus "failed", from a provider webhook body. */
export type LiveKind =
  | "joined"
  | "left"
  | "live_started"
  | "live_stopped"
  | "recording_started"
  | "recording_ready"
  | "session_closed"
  | "failed";

export interface NormalizedEvent {
  providerEventId: string;
  kind: LiveKind;
  roomId: string;
  participantId?: string;
  fileUrl?: string;
}

/**
 * Maps a VideoSDK webhook body to our event. The exact payload is unverified,
 * so this reads defensively and returns null for anything it does not
 * recognise rather than guessing.
 */
export function normalize(
  body: Record<string, unknown>,
): NormalizedEvent | null {
  const type = String(
    body.webhookType ?? body.type ?? body.event ?? "",
  ).toLowerCase();
  const data = (body.data ?? body) as Record<string, unknown>;
  const roomId = String(data.meetingId ?? data.roomId ?? "");
  if (!type || !roomId) return null;
  const id = String(
    body.id ??
      data.id ??
      `${type}:${roomId}:${data.participantId ?? ""}:${data.timestamp ?? data.endedAt ?? data.startedAt ?? ""}`,
  );
  const base = { providerEventId: id, roomId };
  const pid = data.participantId ? String(data.participantId) : undefined;
  if (/fail|error/.test(type)) return { ...base, kind: "failed" };
  if (/participant.*(join)/.test(type))
    return { ...base, kind: "joined", participantId: pid };
  if (/participant.*(left|leave)/.test(type))
    return { ...base, kind: "left", participantId: pid };
  if (/(hls|livestream).*start/.test(type))
    return { ...base, kind: "live_started" };
  if (/(hls|livestream).*stop/.test(type))
    return { ...base, kind: "live_stopped" };
  if (/recording.*start/.test(type))
    return { ...base, kind: "recording_started" };
  if (/recording.*(stop|ready|complete)/.test(type))
    return {
      ...base,
      kind: "recording_ready",
      fileUrl: typeof data.fileUrl === "string" ? data.fileUrl : undefined,
    };
  if (/(session|meeting|room).*(end|clos)/.test(type))
    return { ...base, kind: "session_closed" };
  return null;
}
