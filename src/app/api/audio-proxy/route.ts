import { NextRequest, NextResponse } from "next/server";
import {
  isOwnAudioObjectUrl,
  normalizeAudioContentType,
} from "@/infrastructure/storage/oci-object-storage";

// Re-serves an already-uploaded audio submission with a normalized
// Content-Type — the bucket's stored value can be a non-standard MIME type
// (e.g. "audio/x-m4a" from Apple devices) that most browsers' inline
// <audio> player refuses to play, even though the underlying bytes are
// valid. Only ever proxies our own bucket (see isOwnAudioObjectUrl) — audio
// submissions can also be arbitrary external links (Drive/YouTube via the
// "link" submission mode), and this must not become an open proxy for
// those. Forwards Range so seeking still works.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url || !isOwnAudioObjectUrl(url)) {
    return NextResponse.json({ error: "Invalid audio URL" }, { status: 400 });
  }

  const range = request.headers.get("range");
  const upstream = await fetch(url, {
    headers: range ? { Range: range } : undefined,
  });

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: "Couldn't load audio" },
      { status: upstream.status },
    );
  }

  const headers = new Headers();
  const contentType = normalizeAudioContentType(
    upstream.headers.get("content-type") ?? "application/octet-stream",
  );
  headers.set("Content-Type", contentType);
  for (const name of [
    "accept-ranges",
    "content-length",
    "content-range",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
