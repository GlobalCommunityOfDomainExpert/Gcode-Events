import { ImageResponse } from "next/og";
import sharp from "sharp";
import { getEvent } from "@/lib/api/events";
import { resolveImageUrl } from "@/lib/api/adapters";

export const alt = "GCODE Events";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";

// Social crawlers crop to ~1.91:1, but organizer covers are arbitrary shapes
// (e.g. 2048x768). Render a fixed 1200x630 card and fit the cover inside it
// uncropped so the whole banner survives in WhatsApp/Facebook/LinkedIn.
export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let title = "GCODE Events";
  let cover: string | undefined;
  try {
    const detail = await getEvent(id);
    title = detail.event_name;
    cover = resolveImageUrl(detail.cover_image_url);
  } catch {
    // fall through to the text-only card
  }

  const png = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0b1220 0%, #1b2a4a 100%)",
          padding: 40,
        }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              borderRadius: 16,
            }}
          />
        ) : (
          <div
            style={{
              color: "#ffffff",
              fontSize: 72,
              fontWeight: 700,
              textAlign: "center",
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>
        )}
      </div>
    ),
    { ...size },
  );

  // WhatsApp drops to a tiny thumbnail above ~300KB; a PNG of a photo-heavy
  // cover blows past that, so re-encode as JPEG.
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer()))
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
