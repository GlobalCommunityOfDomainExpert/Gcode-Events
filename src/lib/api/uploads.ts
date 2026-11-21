import { ApiError, v1Request } from "./client";

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

// Uploads one image through /api/v1/uploads/image (server → OCI Object Storage)
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

  const blob = await downscale(file, kind).catch(() => {
    throw new Error(`${file.name}: couldn't read that image.`);
  });
  try {
    const { url } = await v1Request<{ url: string }>("/uploads/image", {
      method: "POST",
      query: { kind },
      raw: { body: blob },
    });
    return url;
  } catch (err) {
    throw new Error(
      err instanceof ApiError ? err.message : `${file.name}: upload failed.`,
    );
  }
}
