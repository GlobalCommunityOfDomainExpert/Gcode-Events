import { route } from "@/server/http/handler";
import { signInAs } from "@/server/modules/auth/auth.mapper";
import {
  googleSignInSchema,
  type GoogleSignInResult,
} from "@/server/modules/auth/auth.schemas";
import { authService } from "@/server/modules/auth/auth.service";

// POST /api/v1/auth/google — signs in (creating the account on first use).
// needsRole=true means the UI should send them to pick a role next.
export const POST = route(
  { auth: "public", body: googleSignInSchema },
  async ({ body }): Promise<GoogleSignInResult> => {
    const { user, needsRole } = await authService.signInWithGoogle(
      body.idToken,
    );
    return { user: await signInAs(user), needsRole };
  },
);
