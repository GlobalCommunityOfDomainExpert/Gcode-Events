import { beforeEach, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ submit: vi.fn() }));
const events = vi.hoisted(() => ({ exists: vi.fn() }));

vi.mock("./enquiries.repository", () => ({ enquiriesRepository: repo }));
vi.mock("@/server/modules/events/events.repository", () => ({
  eventsRepository: events,
}));

const { enquiriesService: svc } = await import("./enquiries.service");
const { submitEnquirySchema } = await import("./enquiries.schemas");

beforeEach(() => {
  vi.clearAllMocks();
  events.exists.mockResolvedValue(true);
});

it("stores the enquiry with absent fields as null", async () => {
  await svc.submit(10, { email: "a@x.com", message: "When are doors?" });
  expect(repo.submit).toHaveBeenCalledWith({
    eventId: 10,
    email: "a@x.com",
    phone: null,
    message: "When are doors?",
    topic: null,
    image: null,
  });
});

it("404s for an unknown event", async () => {
  events.exists.mockResolvedValue(false);
  await expect(
    svc.submit(10, { email: "a@x.com", message: "Hello there" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(repo.submit).not.toHaveBeenCalled();
});

it("only accepts image data URLs", () => {
  const base = { email: "a@x.com", message: "Hello there" };
  expect(
    submitEnquirySchema.safeParse({ ...base, image: "data:image/jpeg;base64,AAAA" })
      .success,
  ).toBe(true);
  expect(
    submitEnquirySchema.safeParse({ ...base, image: "https://evil.example/x.png" })
      .success,
  ).toBe(false);
  expect(
    submitEnquirySchema.safeParse({ ...base, image: "data:text/html;base64,AAAA" })
      .success,
  ).toBe(false);
});
