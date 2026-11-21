import { NextRequest, NextResponse } from "next/server";
import { applyProviderEvent } from "@/server/portal/live";
import { normalize, verifyWebhook } from "@/server/portal/provider";

// Provider webhooks. The signature is checked against the RAW body before
// anything is parsed; an unsigned or tampered request changes nothing.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature =
    req.headers.get("videosdk-signature") ??
    req.headers.get("x-videosdk-signature");
  if (!(await verifyWebhook(raw, signature)))
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  try {
    const ev = normalize(JSON.parse(raw) as Record<string, unknown>);
    if (ev) await applyProviderEvent(ev);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook]", err);
    // 500 asks the provider to retry; replays are harmless (unique event id).
    return NextResponse.json({ error: "Could not process" }, { status: 500 });
  }
}
