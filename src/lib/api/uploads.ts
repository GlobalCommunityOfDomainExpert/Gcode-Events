import { getSession } from "@/lib/auth/session";

export type ImageUploadKind = "gallery" | "logo";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

// Longest edge after downscaling. Keeps every upload well under the
// serverless body limit; logos stay small and keep their transparency.
const MAX_EDGE: Record<ImageUploadKind, number> = { gallery: 1600, logo: 400 };

async function decode(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

async function downscale(file: File, kind: ImageUploadKind): Promise<Blob> {
  const bitmap = await decode(file);
  const edge = MAX_EDGE[kind];
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't read that image.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // Logos stay PNG (transparency); photos become JPEG. Animated GIFs are
  // flattened to their first frame.
  const type = kind === "logo" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, 0.85),
  );
  if (!blob) throw new Error("Couldn't read that image.");
  return blob;
}

// Uploads one image through /api/uploads/image (server → OCI Object Storage)
// and returns its public URL. Throws an Error with a user-facing message.
export async function uploadImage(
  file: File,
  kind: ImageUploadKind,
): Promise<string> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new Error(`${file.name}: only PNG, JPEG, WebP or GIF images.`);
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(`${file.name}: images must be under 10 MB.`);
  }
  const session = getSession();
  if (!session) throw new Error("Sign in again to upload.");

  const blob = await downscale(file, kind).catch(() => {
    throw new Error(`${file.name}: couldn't read that image.`);
  });
  const res = await fetch(`/api/uploads/image?kind=${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": blob.type,
      Authorization: `Bearer ${session.token}`,
    },
    body: blob,
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? `${file.name}: upload failed.`);
  }
  return data.url;
}
