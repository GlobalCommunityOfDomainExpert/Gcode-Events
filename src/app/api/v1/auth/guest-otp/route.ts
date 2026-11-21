import { route } from "@/server/http/handler";
import { perEmail, perIp } from "@/server/rate-limit/rate-limit";
import { guestOtpSchema } from "@/server/modules/auth/auth.schemas";
import { authService } from "@/server/modules/auth/auth.service";

// POST /api/v1/auth/guest-otp — email verification for guest checkout.
export const POST = route(
  {
    auth: "public",
    body: guestOtpSchema,
    // Each send emails a code — also stops mail-bombing an address.
    rateLimit: [
      perEmail("guest-otp", 5, 60 * 60),
      perIp("guest-otp", 20, 60 * 60),
    ],
  },
  async ({ body }) => authService.sendGuestOtp(body),
);
