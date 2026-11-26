import { NextResponse, type NextRequest } from "next/server";
import { webinarService } from "@/server/modules/portal/webinar.service";
import {
  normalize,
  verifyWebhook,
} from "@/server/modules/portal/webinar.provider";

// POST /api/v1/webhooks/live — the video provider's webhooks.
//
// Not wrapped in route(): the signature is checked against the RAW body
// before anything is parsed, and an unsigned or tampered request changes
// nothing. 500 asks the provider to retry; replays are harmless (each
// provider event id is stored once).
export async function POST(req: NextRequest): Promise<Response> {
  const raw = await req.text();
  const signature =
    req.headers.get("videosdk-signature") ??
    req.headers.get("x-videosdk-signature");
  if (!(await verifyWebhook(raw, signature)))
    return new NextResponse(null, { status: 403 });
  try {
    const ev = normalize(JSON.parse(raw) as Record<string, unknown>);
    if (ev) await webinarService.applyProviderEvent(ev);
    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("[webhooks] live delivery failed", err);
    return new NextResponse(null, { status: 500 });
  }
}
