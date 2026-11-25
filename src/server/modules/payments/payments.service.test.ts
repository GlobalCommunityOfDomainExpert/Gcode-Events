import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/session";

const repo = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);

vi.mock("./payments.repository", () => ({ paymentsRepository: repo }));

const { paymentsService: svc } = await import("./payments.service");

const member: SessionUser = {
  userId: "7",
  role: "PARTICIPANT",
  fullName: "Bo",
  email: "bo@x.com",
};

const order = {
  isFree: 0,
  participantId: null,
  orderId: "GC10_abc",
  paymentSessionId: "session_xyz",
  amount: 499,
  currency: "INR",
  cfEnv: "PROD",
};

beforeEach(() => {
  for (const n of ["createOrder", "verifyOrder", "processWebhook"])
    repo[n] = vi.fn(async () => null);
  repo.createOrder.mockResolvedValue(order);
});

const body = {
  quantity: 1,
  category: "ATTENDEE" as const,
  phone: "9876543210",
};

describe("createOrder", () => {
  it("orders for the signed-in account, ignoring body identity", async () => {
    await svc.createOrder(
      10,
      { ...body, email: "x@x.com", fullName: "X" },
      member,
    );
    const input = repo.createOrder.mock.calls[0][0];
    expect(input).toMatchObject({
      eventId: 10,
      userId: "7",
      phone: "9876543210",
    });
    expect(input).not.toHaveProperty("email");
    expect(input).not.toHaveProperty("fullName");
  });

  it("passes a guest's details and coupon through", async () => {
    await svc.createOrder(
      10,
      { ...body, email: "g@x.com", fullName: "G", couponCode: "HALF" },
      null,
    );
    expect(repo.createOrder.mock.calls[0][0]).toMatchObject({
      email: "g@x.com",
      fullName: "G",
      couponCode: "HALF",
    });
  });

  it("returns the checkout details", async () => {
    await expect(svc.createOrder(10, body, member)).resolves.toEqual({
      free: false,
      orderId: "GC10_abc",
      paymentSessionId: "session_xyz",
      amount: 499,
      currency: "INR",
      env: "prod",
    });
    repo.createOrder.mockResolvedValue({ ...order, cfEnv: "TEST" });
    await expect(svc.createOrder(10, body, member)).resolves.toMatchObject({
      env: "test",
    });
  });

  it("reports a fully covered price as a free registration", async () => {
    repo.createOrder.mockResolvedValue({
      ...order,
      isFree: 1,
      participantId: 900,
      orderId: null,
      paymentSessionId: null,
    });
    await expect(svc.createOrder(10, body, member)).resolves.toEqual({
      free: true,
      participantId: 900,
    });
  });

  it("fails cleanly when no payment session came back", async () => {
    repo.createOrder.mockResolvedValue({ ...order, paymentSessionId: null });
    await expect(svc.createOrder(10, body, member)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });
});

it("verify maps the package's answer", async () => {
  repo.verifyOrder.mockResolvedValue({ status: "PAID", participantId: 900 });
  await expect(svc.verify("GC10_abc")).resolves.toEqual({
    status: "PAID",
    participantId: 900,
  });
  expect(repo.verifyOrder).toHaveBeenCalledWith("GC10_abc");
});

it("processWebhook hands the raw delivery to the package", async () => {
  repo.processWebhook.mockResolvedValue("REJECTED");
  const delivery = {
    payload: '{"type":"PAYMENT_SUCCESS_WEBHOOK"}',
    signature: "sig",
    timestamp: "1700000000",
    idempotencyKey: null,
  };
  await expect(svc.processWebhook(delivery)).resolves.toBe("REJECTED");
  expect(repo.processWebhook).toHaveBeenCalledWith(delivery);
});
