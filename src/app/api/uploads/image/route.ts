import { NextRequest, NextResponse } from "next/server";
import { uploadImageObject } from "@/lib/oci/object-storage";
import { sniffImage } from "@/lib/uploads/image-type";

// Vercel caps a function request body at ~4.5 MB; the browser downscales
// first (lib/api/uploads.ts), so real uploads are far below this.
const MAX_BYTES = 4 * 1024 * 1024;

const FOLDERS: Record<string, string> = {
  gallery: "gallery",
  logo: "partner-logos",
};

// Reads the caller's role from the session JWT. The signature can't be
// checked here (the signing secret lives in the database), so this is a gate
// against casual misuse, not proof of identity — see the findings note.
function organizerFromAuthHeader(header: string | null): boolean {
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(
        token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8"),
    );
    if (payload.exp && Date.now() / 1000 > payload.exp) return false;
    return payload.role === "ADMIN";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!organizerFromAuthHeader(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  }

  const kind = request.nextUrl.searchParams.get("kind") ?? "";
  const folder = FOLDERS[kind];
  if (!folder) {
    return NextResponse.json({ error: "Unknown upload kind" }, { status: 400 });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large" }, { status: 413 });
  }
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (body.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large" }, { status: 413 });
  }

  const image = sniffImage(body);
  if (!image) {
    return NextResponse.json(
      { error: "Only PNG, JPEG, WebP or GIF images can be uploaded." },
      { status: 415 },
    );
  }

  try {
    const url = await uploadImageObject(
      folder,
      image.extension,
      body,
      image.mime,
    );
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[uploads/image]", err);
    return NextResponse.json(
      { error: "Couldn't upload the image. Please try again." },
      { status: 502 },
    );
  }
}
