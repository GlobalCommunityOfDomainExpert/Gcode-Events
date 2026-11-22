import { API_BASE_URL } from "@/lib/api/client";
import { HttpError } from "./http";

// Client for the small ORDS module in docs/sql/organizer-portal/02_rest.sql.
// Server-only: every request carries ORDS_PORTAL_KEY, which must never reach a
// browser. APEX holds tables only; the module is plain SELECT / INSERT /
// UPDATE / DELETE on them, and every decision is made in the callers.

const base = `${(
  process.env.ORDS_ROOT ?? API_BASE_URL.replace(/\/v1\/?$/, "")
).replace(/\/$/, "")}/v1/portal`;

function key(): string {
  const k = process.env.ORDS_PORTAL_KEY;
  if (!k) throw new Error("ORDS_PORTAL_KEY is not set");
  return k;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${base}/${path}`, {
    ...init,
    headers: {
      "X-Portal-Key": key(),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

export type Row = Record<string, unknown> & { id?: number };

const query = (where: Record<string, string | number>) =>
  new URLSearchParams(
    Object.entries(where).map(([k, v]) => [k, String(v)]),
  ).toString();

/** All rows matching an equality filter, across pages. */
export async function list<T = Row>(
  table: string,
  where: Record<string, string | number> = {},
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 20_000; offset += 500) {
    const qs = query({ ...where, limit: 500, offset });
    const res = await call(`${table}?${qs}`);
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
  const res = await call(`${table}?${query({ ...where, limit: 1 })}`);
  if (!res.ok) throw new Error(`ORDS ${table} lookup failed (${res.status})`);
  const j = (await res.json()) as { items: T[] };
  return j.items[0] ?? null;
}

// The module answers HTTP 200 with {"error": "..."} when it refuses or a unique
// key is hit, the same convention as the rest of this API.
async function write<T>(res: Response, what: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) throw new Error(`ORDS ${what} failed (${res.status})`);
  const j = JSON.parse(text) as T & { error?: string };
  if (j.error === "duplicate") throw new HttpError(409, "That already exists");
  if (j.error) throw new Error(`ORDS ${what} refused: ${j.error}`);
  return j;
}

export async function insert<T = Row>(
  table: string,
  row: Record<string, unknown>,
): Promise<T> {
  const res = await call(table, { method: "POST", body: JSON.stringify(row) });
  return write<T>(res, `${table} insert`);
}

/**
 * Update a row by id. Each table's route changes only its mutable columns, so
 * passing the whole row (as the callers do) is safe.
 */
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
  const j = await write<{ ok?: boolean }>(res, `${table} update`);
  if (j.ok === false) throw new Error(`ORDS ${table} update matched no row`);
}

export async function remove(
  table: string,
  id: number | string,
): Promise<void> {
  const res = await call(`${table}/${id}`, { method: "DELETE" });
  await write(res, `${table} delete`);
}

/** ISO text the module turns into a TIMESTAMP. */
export const ts = (d: Date = new Date()) =>
  d.toISOString().replace(/\.\d+Z$/, "Z");
