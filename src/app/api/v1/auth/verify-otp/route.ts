import { route } from "@/server/http/handler";
import { perEmail, perIp } from "@/server/rate-limit/rate-limit";
import { verifyOtpSchema } from "@/server/modules/auth/auth.schemas";
import { authService } from "@/server/modules/auth/auth.service";

// POST /api/v1/auth/verify-otp
export const POST = route(
  {
    auth: "public",
    body: verifyOtpSchema,
    // Caps guesses at a 6-digit code: 10 per address per 15 min.
    rateLimit: [
      perEmail("verify-otp", 10, 15 * 60),
      perIp("verify-otp", 50, 15 * 60),
    ],
  },
  async ({ body }) => authService.verifyOtp(body),
);
