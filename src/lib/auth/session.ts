import type { AuthUser } from "@/server/modules/auth/auth.schemas";

// The real session is the httpOnly `gcode_session` cookie set by
// /api/v1/auth/*: JS can't read it and the server verifies it on every
// request. What's kept here is only a profile snapshot so the UI can know
// synchronously who's signed in (name in the navbar, admin-only links).
// It is NOT a credential — editing it changes what the UI shows, never what
// the server allows.
const PROFILE_KEY = "gcode_profile";
// Pre-cookie sessions stored a bearer JWT here; cleared on sight.
const LEGACY_TOKEN_KEY = "gcode_token";

export interface Session {
  userId: string;
  roleName: string;
  fullName: string;
  email?: string;
  expiresAt: string;
}

export function setSession(user: AuthUser): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(user));
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function getSession(): Session | null {
  // Server and client components can both call this; there's no
  // localStorage during SSR.
  if (typeof window === "undefined") return null;

  if (localStorage.getItem(LEGACY_TOKEN_KEY)) {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }

  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as AuthUser;
    // Matches the cookie's own expiry, so the UI signs out when it does.
    if (!user.userId || Date.parse(user.expiresAt) <= Date.now()) {
      clearSession();
      return null;
    }
    return {
      userId: user.userId,
      roleName: user.role ?? "NONE",
      fullName: user.fullName ?? "",
      email: user.email || undefined,
      expiresAt: user.expiresAt,
    };
  } catch {
    clearSession();
    return null;
  }
}

// Local only — use signOut() from @/lib/api/auth to also end the cookie.
export function clearSession(): void {
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export const ADMIN_ROLE = "ADMIN";

// UI gating only; the API enforces admin access itself.
// Can create a redirect page, when authorized user try to access a page, currently redirects to login
export function isAdmin(session: Session | null): boolean {
  return session?.roleName === ADMIN_ROLE;
}
