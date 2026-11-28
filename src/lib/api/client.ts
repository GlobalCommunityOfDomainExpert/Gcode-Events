import type { ApiErrorBody, PageInfo } from "@/server/http/contract";
import { withBasePath } from "@/lib/base-path";

// TODO: Define Defferent Error Class
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    // Machine-readable code from /api/v1 errors (NOT_FOUND, CONFLICT, …).
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  cache?: RequestCache;
  // Binary body (file upload) sent as-is instead of JSON, with its headers.
  raw?: { body: Blob; headers?: Record<string, string> };
}

// ── /api/v1 (Next.js route handlers) ────────────────────────────────────
// Same-origin, cookie-authenticated, and every response is `{ data }`,
// `{ data, page }` or `{ error: { code, message } }` with a real HTTP
// status.

// Shared by v1Request/v1RequestPage: one place that turns non-2xx and
// `{ error }` bodies into ApiError.
async function v1Fetch<TBody>(
  path: string,
  { method = "GET", body, query, cache, raw }: RequestOptions,
): Promise<TBody | undefined> {
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
  }
  const qs = params.size ? `?${params}` : "";

  const res = await fetch(withBasePath(`/api/v1${path}${qs}`), {
    method,
    headers: raw
      ? { "Content-Type": raw.body.type || "application/octet-stream", ...raw.headers }
      : body
        ? { "Content-Type": "application/json" }
        : undefined,
    body: raw ? raw.body : body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache,
  });

  if (res.status === 204) return undefined;
  const json = (await res.json().catch(() => null)) as
    TBody | ApiErrorBody | null;

  if (!res.ok || !json || (typeof json === "object" && "error" in json)) {
    const error =
      json && typeof json === "object" && "error" in json
        ? (json as ApiErrorBody).error
        : null;
    throw new ApiError(
      error?.message ?? `Request failed: ${res.status}`,
      res.status,
      error?.code,
    );
  }
  return json as TBody;
}

export async function v1Request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const json = await v1Fetch<{ data: T }>(path, options);
  return json?.data as T;
}

// For list endpoints: the rows plus the `page` info.
export async function v1RequestPage<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T[]; page: PageInfo }> {
  const json = await v1Fetch<{ data: T[]; page: PageInfo }>(path, options);
  if (!json) throw new ApiError("Empty response", 204);
  return json;
}
