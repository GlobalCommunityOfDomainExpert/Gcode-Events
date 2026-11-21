import { route } from "@/server/http/handler";
import { perEmail, perIp } from "@/server/rate-limit/rate-limit";
import { created } from "@/server/http/responses";
import { signUpSchema } from "@/server/modules/auth/auth.schemas";
import { authService } from "@/server/modules/auth/auth.service";

// POST /api/v1/auth/sign-up — parks the details and emails a code; the
// account is created by select-role after verify-otp.
export const POST = route(
  {
    auth: "public",
    body: signUpSchema,
    // Each sign-up emails a code.
    rateLimit: [perEmail("sign-up", 5, 60 * 60), perIp("sign-up", 20, 60 * 60)],
  },
  async ({ body }) => created(await authService.signUp(body)),
);
