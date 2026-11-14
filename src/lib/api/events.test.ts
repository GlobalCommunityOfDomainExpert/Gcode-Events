import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();

vi.mock("./client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  API_BASE_URL: "https://api.example.com/ords/v1",
  ApiError: class ApiError extends Error {},
}));

import { listEvents } from "./events";

const rows = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: from + i }));

const next = (page: number) => ({
  $ref: `https://api.example.com/ords/v1/events/?page=${page}`,
});

describe("listEvents", () => {
  beforeEach(() => apiRequest.mockReset());

  it("returns a single page as is", async () => {
    apiRequest.mockResolvedValueOnce({ items: rows(1, 3) });
    expect(await listEvents()).toHaveLength(3);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("follows next links until the last page", async () => {
    apiRequest
      .mockResolvedValueOnce({ items: rows(1, 25), next: next(1) })
      .mockResolvedValueOnce({ items: rows(26, 25), next: next(2) })
      .mockResolvedValueOnce({ items: rows(51, 7) });

    const events = await listEvents({ is_featured: 1 });

    expect(events).toHaveLength(57);
    expect(events.map((e) => e.id)).toEqual(
      Array.from({ length: 57 }, (_, i) => i + 1),
    );
    expect(apiRequest.mock.calls.map((c) => c[1].query)).toEqual([
      { is_featured: 1 },
      { is_featured: 1, page: 1 },
      { is_featured: 1, page: 2 },
    ]);
  });

  it("throws instead of returning a partial list on a bad next link", async () => {
    apiRequest.mockResolvedValue({ items: rows(1, 25), next: next(0) });
    await expect(listEvents()).rejects.toThrow(/next-page link/);
  });
});
