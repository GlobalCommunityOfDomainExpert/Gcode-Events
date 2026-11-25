import { route } from "@/server/http/handler";
import type { AuthUser } from "@/server/modules/auth/auth.schemas";
import { toAuthUser } from "@/server/modules/auth/auth.mapper";

// GET /api/v1/auth/me → the signed-in user, or null when signed out.
export const GET = route(
  { auth: "public" },
  async ({ user }): Promise<AuthUser | null> =>
    user?.expiresAt ? toAuthUser({ ...user, expiresAt: user.expiresAt }) : null,
);
