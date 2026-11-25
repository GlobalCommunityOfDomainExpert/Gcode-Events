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
      // ORDS answers 400 to a DELETE or GET that declares a body it does not have.
      ...(init.body ? { "Content-Type": "application/json" } : {}),
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

// ORDS answers an empty list as soon as a limit or offset parameter is sent to
// these routes, so no paging is requested: the module returns up to 10,000
// rows per call (02_rest.sql) and a longer result is an error, not a silent cut.
/** All rows matching an equality filter. */
export async function list<T = Row>(
  table: string,
  where: Record<string, string | number> = {},
): Promise<T[]> {
  const qs = query(where);
  const res = await call(`${table}${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`ORDS ${table} list failed (${res.status})`);
  const j = (await res.json()) as { items: T[]; hasMore?: boolean };
  if (j.hasMore)
    throw new Error(`ORDS ${table} list has more than 10,000 rows`);
  return j.items;
}

export async function first<T = Row>(
  table: string,
  where: Record<string, string | number>,
): Promise<T | null> {
  const res = await call(`${table}?${query(where)}`);
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

// ORDS binds a JSON string that ends in "Z" as a timestamp the module's SQL
// cannot read (HTTP 555), but takes the same time without the "Z". Times read
// back from ORDS carry a "Z" and a fraction, so every body is cleaned here.
const ISO_Z = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
const body = (row: Record<string, unknown>) =>
  JSON.stringify(row, (_k, v) =>
    typeof v === "string" && ISO_Z.test(v) ? v.slice(0, 19) : v,
  );

export async function insert<T = Row>(
  table: string,
  row: Record<string, unknown>,
): Promise<T> {
  const res = await call(table, { method: "POST", body: body(row) });
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
  const clean = { ...row };
  delete clean.links;
  const res = await call(`${table}/${id}`, {
    method: "PUT",
    body: body(clean),
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

/** UTC time as ISO text without the "Z" (see `body`). */
export const ts = (d: Date = new Date()) => d.toISOString().slice(0, 19);

/** Delete by id; a refusal from the database comes back as text, not a throw. */
export async function tryRemove(
  table: string,
  id: number | string,
  query = "",
): Promise<{ ok: boolean; error?: string }> {
  const res = await call(`${table}/${id}${query}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`ORDS ${table} delete failed (${res.status})`);
  const j = (await res.json()) as { ok?: boolean; error?: string };
  return j.error ? { ok: false, error: j.error } : { ok: j.ok !== false };
}
