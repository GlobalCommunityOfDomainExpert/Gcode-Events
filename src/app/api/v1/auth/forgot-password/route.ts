import { route } from "@/server/http/handler";
import { perEmail, perIp } from "@/server/rate-limit/rate-limit";
import { forgotPasswordSchema } from "@/server/modules/auth/auth.schemas";
import { authService } from "@/server/modules/auth/auth.service";
import { BASE_PATH } from "@/lib/base-path";

// POST /api/v1/auth/forgot-password — the link's origin is ours (APP_URL,
// else this request's origin), never taken from the client.
export const POST = route(
  {
    auth: "public",
    body: forgotPasswordSchema,
    // Each request emails a reset link.
    rateLimit: [
      perEmail("forgot-password", 5, 60 * 60),
      perIp("forgot-password", 20, 60 * 60),
    ],
  },
  async ({ body, req }) =>
    authService.requestPasswordReset(
      body,
      process.env.APP_URL ?? `${req.nextUrl.origin}${BASE_PATH}`,
    ),
);
