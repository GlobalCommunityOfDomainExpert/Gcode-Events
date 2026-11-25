import { route } from "@/server/http/handler";
import { perIp } from "@/server/rate-limit/rate-limit";
import { resetPasswordSchema } from "@/server/modules/auth/auth.schemas";
import { authService } from "@/server/modules/auth/auth.service";

// POST /api/v1/auth/reset-password
export const POST = route(
  {
    auth: "public",
    body: resetPasswordSchema,
    rateLimit: [perIp("reset-password", 20, 60 * 60)],
  },
  async ({ body }) => authService.resetPassword(body),
);
