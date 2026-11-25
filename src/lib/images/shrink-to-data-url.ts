// Browser-only (canvas). Not an API call — lives here rather than in
// src/lib/api.

// Longest side `max` px, JPEG — keeps a picked image small enough to send inline.
export async function shrinkToDataUrl(blob: Blob, max = 1600): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}
