import { route } from "@/server/http/handler";
import { perEmail, perIp } from "@/server/rate-limit/rate-limit";
import { noContent } from "@/server/http/responses";
import { eventIdParamsSchema } from "@/server/modules/events/events.schemas";
import { submitEnquirySchema } from "@/server/modules/enquiries/enquiries.schemas";
import { enquiriesService } from "@/server/modules/enquiries/enquiries.service";

// POST /api/v1/events/:id/enquiries → 204 (public)
export const POST = route(
  {
    auth: "public",
    params: eventIdParamsSchema,
    body: submitEnquirySchema,
    // Each enquiry can carry a ~3 MB image.
    rateLimit: [perIp("enquiry", 5, 60 * 60), perEmail("enquiry", 5, 60 * 60)],
  },
  async ({ params, body }) => {
    await enquiriesService.submit(params.id, body);
    return noContent();
  },
);
