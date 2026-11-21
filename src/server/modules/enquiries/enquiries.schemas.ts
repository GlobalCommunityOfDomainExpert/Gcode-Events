import { z } from "zod";
import { phoneSchema } from "@/server/modules/interest/interest.schemas";

// API contract for organizer enquiries from the event page. Shared with
// src/lib/api/event-enquiries.ts.

// ~3 MB of base64 — a phone photo after shrinkToDataUrl (≤1600px JPEG) is
// well under this.
const MAX_IMAGE_CHARS = 4_000_000;

// POST /api/v1/events/:id/enquiries (public). Stored in
// GCODE_EVENT_ENQUIRIES for follow-up; nothing is emailed yet.
export const submitEnquirySchema = z.object({
  email: z.email().max(320),
  phone: phoneSchema.optional(),
  message: z.string().trim().min(5).max(2000),
  topic: z.string().trim().min(1).max(60).optional(),
  // A data URL picked from the device (screenshot/photo).
  image: z
    .string()
    .max(MAX_IMAGE_CHARS, "That image is too large")
    .regex(/^data:image\/(jpeg|png|webp);base64,/, "Attach a JPG, PNG or WebP image")
    .optional(),
});

export type SubmitEnquiryBody = z.infer<typeof submitEnquirySchema>;
