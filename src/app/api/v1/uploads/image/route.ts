import { z } from "zod";
import { route } from "@/server/http/handler";
import { AppError } from "@/server/http/errors";
import { uploadImageObject } from "@/infrastructure/storage/oci-object-storage";
import { sniffImage } from "@/lib/uploads/image-type";

// Vercel caps a function request body at ~4.5 MB; the browser downscales
// first (lib/api/uploads.ts), so real uploads are far below this.
const MAX_BYTES = 4 * 1024 * 1024;

const FOLDERS = { gallery: "gallery", logo: "partner-logos" } as const;

const querySchema = z.object({ kind: z.enum(["gallery", "logo"]) });

// POST /api/v1/uploads/image?kind=gallery|logo — raw image bytes as the
// body. Organizer gallery photos and partner logos go to OCI Object Storage.
// → { data: { url } }
export const POST = route(
  { auth: "admin", query: querySchema },
  async ({ query, req }) => {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES)
      throw AppError.badRequest("Image is too large");
    const body = Buffer.from(await req.arrayBuffer());
    if (body.length === 0) throw AppError.badRequest("Empty file");
    if (body.length > MAX_BYTES)
      throw AppError.badRequest("Image is too large");

    // The bytes decide the type, not the declared Content-Type.
    const image = sniffImage(body);
    if (!image)
      throw AppError.badRequest(
        "Only PNG, JPEG, WebP or GIF images can be uploaded.",
      );

    const url = await uploadImageObject(
      FOLDERS[query.kind],
      image.extension,
      body,
      image.mime,
    );
    return { url };
  },
);
