import { beforeEach, describe, expect, it, vi } from "vitest";

const v1RequestPage = vi.fn();

vi.mock("./client", () => ({
  v1Request: vi.fn(),
  v1RequestPage: (...args: unknown[]) => v1RequestPage(...args),
  ApiError: class ApiError extends Error {},
}));

import { listEvents } from "./events";

const rows = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: from + i }));

const page = (data: unknown[], offset: number, total: number) => ({
  data,
  page: { limit: 100, offset, total, hasMore: offset + data.length < total },
});

describe("listEvents", () => {
  beforeEach(() => v1RequestPage.mockReset());

  it("returns a single page as is", async () => {
    v1RequestPage.mockResolvedValueOnce(page(rows(1, 3), 0, 3));
    expect(await listEvents()).toHaveLength(3);
    expect(v1RequestPage).toHaveBeenCalledTimes(1);
  });

  it("walks every page so the full list is returned, not just the first", async () => {
    v1RequestPage
      .mockResolvedValueOnce(page(rows(1, 100), 0, 207))
      .mockResolvedValueOnce(page(rows(101, 100), 100, 207))
      .mockResolvedValueOnce(page(rows(201, 7), 200, 207));

    const events = await listEvents({ featured: true });

    expect(events.map((e) => e.id)).toEqual(
      Array.from({ length: 207 }, (_, i) => i + 1),
    );
    expect(v1RequestPage.mock.calls.map((c) => [c[0], c[1].query])).toEqual([
      ["/events", { featured: true, limit: 100, offset: 0 }],
      ["/events", { featured: true, limit: 100, offset: 100 }],
      ["/events", { featured: true, limit: 100, offset: 200 }],
    ]);
  });

  it("stops on an empty page even if the server claims there's more", async () => {
    v1RequestPage.mockResolvedValue({
      data: [],
      page: { limit: 100, offset: 0, total: 5, hasMore: true },
    });
    expect(await listEvents()).toEqual([]);
    expect(v1RequestPage).toHaveBeenCalledTimes(1);
  });
});
