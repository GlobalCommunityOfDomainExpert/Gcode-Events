import { NextResponse, type NextRequest } from "next/server";
import { paymentsService } from "@/server/modules/payments/payments.service";

// POST /api/v1/webhooks/cashfree — Cashfree's server-to-server payment
// notification. A safety net for buyers who close the tab before the
// browser verifies; the package re-reads the order from Cashfree rather
// than trusting the payload.
//
// Not wrapped in route(): the body must reach the signature check byte for
// byte, and Cashfree only cares about the status code — 2xx done, 401
// rejected (bad signature), 5xx retry later.

// GCODE_CASHFREE_PAYMENTS_API rejects payloads larger than this anyway.
const MAX_BYTES = 64 * 1024;

export async function POST(req: NextRequest): Promise<Response> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return new NextResponse(null, { status: 413 });
  }
  const payload = await req.text();
  if (Buffer.byteLength(payload) > MAX_BYTES) {
    return new NextResponse(null, { status: 413 });
  }
  try {
    const result = await paymentsService.processWebhook({
      payload,
      signature: req.headers.get("x-webhook-signature"),
      timestamp: req.headers.get("x-webhook-timestamp"),
      idempotencyKey: req.headers.get("x-idempotency-key"),
    });
    return new NextResponse(null, { status: result === "OK" ? 200 : 401 });
  } catch (err) {
    console.error("[webhooks] cashfree delivery failed", err);
    return new NextResponse(null, { status: 500 });
  }
}
