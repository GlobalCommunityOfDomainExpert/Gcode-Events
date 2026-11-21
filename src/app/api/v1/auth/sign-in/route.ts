import { route } from "@/server/http/handler";
import { perEmail, perIp } from "@/server/rate-limit/rate-limit";
import { signInAs } from "@/server/modules/auth/auth.mapper";
import { signInSchema } from "@/server/modules/auth/auth.schemas";
import { authService } from "@/server/modules/auth/auth.service";

// POST /api/v1/auth/sign-in → sets the session cookie, returns the user.
export const POST = route(
  {
    auth: "public",
    body: signInSchema,
    // Slows password guessing per account and per IP.
    rateLimit: [
      perEmail("sign-in", 10, 15 * 60),
      perIp("sign-in", 50, 15 * 60),
    ],
  },
  async ({ body }) => signInAs(await authService.signIn(body)),
);
