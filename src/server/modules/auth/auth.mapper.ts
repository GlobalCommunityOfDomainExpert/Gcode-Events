import "server-only";
import { startSession, type SessionUser } from "@/server/auth/session";
import type { AuthUser } from "./auth.schemas";

export function toAuthUser(
  user: SessionUser & { expiresAt: string },
): AuthUser {
  return {
    userId: user.userId,
    role: user.role,
    fullName: user.fullName,
    email: user.email ?? "",
    expiresAt: user.expiresAt,
  };
}

// Sets the session cookie and returns what the browser may know about it.
export async function signInAs(user: SessionUser): Promise<AuthUser> {
  return toAuthUser(await startSession(user));
}
