import { API_BASE_URL } from "@/lib/api/client";
import { HttpError } from "./http";

// ORDS AutoREST client for the Handover 7 tables (docs/sql/organizer-portal).
// Server-only: it signs in with an OAuth2 client secret that must never reach
// a browser. APEX holds tables only; every decision is made in the callers.

const root = (
  process.env.ORDS_ROOT ?? API_BASE_URL.replace(/\/v1\/?$/, "")
).replace(/\/$/, "");

let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 30_000) return cached.token;
  const id = process.env.ORDS_CLIENT_ID;
  const secret = process.env.ORDS_CLIENT_SECRET;
  if (!id || !secret)
    throw new Error("ORDS_CLIENT_ID / ORDS_CLIENT_SECRET are not set");
  const res = await fetch(`${root}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ORDS token request failed (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, expires: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  const res = await fetch(`${root}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (res.status === 401) cached = null; // token revoked: sign in again next time
  return res;
}

export type Row = Record<string, unknown> & { id?: number };

/** All rows matching an equality filter, across pages. */
export async function list<T = Row>(
  table: string,
  where: Record<string, string | number> = {},
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 20_000; offset += 500) {
    const q = encodeURIComponent(JSON.stringify(where));
    const res = await call(`${table}/?q=${q}&limit=500&offset=${offset}`);
    if (!res.ok) throw new Error(`ORDS ${table} list failed (${res.status})`);
    const j = (await res.json()) as { items: T[]; hasMore?: boolean };
    out.push(...j.items);
    if (!j.hasMore) break;
  }
  return out;
}

export async function first<T = Row>(
  table: string,
  where: Record<string, string | number>,
): Promise<T | null> {
  const q = encodeURIComponent(JSON.stringify(where));
  const res = await call(`${table}/?q=${q}&limit=1`);
  if (!res.ok) throw new Error(`ORDS ${table} lookup failed (${res.status})`);
  const j = (await res.json()) as { items: T[] };
  return j.items[0] ?? null;
}

export async function insert<T = Row>(
  table: string,
  row: Record<string, unknown>,
): Promise<T> {
  const res = await call(`${table}/`, {
    method: "POST",
    body: JSON.stringify(row),
  });
  const text = await res.text();
  if (!res.ok) {
    // A unique key was hit (a second invite for the same email, a replayed
    // webhook, a repeated check-in).
    if (/ORA-00001|unique constraint/i.test(text))
      throw new HttpError(409, "That already exists");
    throw new Error(
      `ORDS ${table} insert failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }
  return JSON.parse(text) as T;
}

/** Full-row replace: omitted columns become NULL, so pass the whole row. */
export async function replace(
  table: string,
  id: number | string,
  row: Record<string, unknown>,
): Promise<void> {
  const body = { ...row };
  delete body.links;
  const res = await call(`${table}/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ORDS ${table} update failed (${res.status})`);
}

export async function remove(
  table: string,
  id: number | string,
): Promise<void> {
  const res = await call(`${table}/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404)
    throw new Error(`ORDS ${table} delete failed (${res.status})`);
}

/** ISO text ORDS accepts for a TIMESTAMP column. */
export const ts = (d: Date = new Date()) =>
  d.toISOString().replace(/\.\d+Z$/, "Z");
