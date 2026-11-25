import { ApiError } from "./client";

// Same-origin calls to the Next.js server routes under /api/portal. These are
// where the organizer portal and live room do their work; APEX only stores the
// rows. Mirrors apiRequest so the API modules read the same.
interface Options {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
}

export async function portalRequest<T>(
  path: string,
  { method = "GET", body, query }: Options = {},
): Promise<T> {
  const url = new URL(`/api/portal${path}`, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {}))
    if (v !== undefined) url.searchParams.set(k, v);
  // The login cookie rides along on same-origin requests.
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!res.ok || (data && typeof data === "object" && "error" in data)) {
    throw new ApiError(data?.error ?? "Something went wrong.", res.status);
  }
  return data as T;
}
