import "server-only";
import { NextResponse } from "next/server";
import type { AppError } from "./errors";
import type { PageInfo } from "./contract";

// Every /api/v1 response uses one of these, so the client only ever has to
// understand `{ data }`, `{ data, page }` or `{ error }`.

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function paginated<T>(data: T[], page: PageInfo, init?: ResponseInit) {
  return NextResponse.json({ data, page }, init);
}

export function fail(error: AppError) {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && { details: error.details }),
      },
    },
    { status: error.status },
  );
}

// Uploaded bytes served from our own origin: only plain raster images get
// an image type. Anything else (HTML, SVG — both can run script) is sent
// as a download so a malicious upload can't execute on this site.
const SAFE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export function storedImage(image: { bytes: Buffer; mime: string }) {
  const mime = image.mime.toLowerCase();
  const safe = SAFE_IMAGE_TYPES.has(mime);
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": safe ? mime : "application/octet-stream",
      ...(!safe && { "Content-Disposition": "attachment" }),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // Re-uploads keep the same URL, so keep the cache short.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}
