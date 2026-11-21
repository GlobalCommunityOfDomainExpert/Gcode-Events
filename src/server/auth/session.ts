import "server-only";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { AppError } from "@/server/http/errors";

// Next.js owns the login session: a short HS256 JWT in an httpOnly cookie,
// signed with AUTH_SECRET. Browser JS can't read it, and route handlers take
// the user's identity from here — never from a request body.

export const SESSION_COOKIE = "gcode_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface SessionUser {
  // GCODE_USERS.USER_ID is 30-40 digits — always a string, never a number.
  userId: string;
  // "ADMIN" | "NONE" today (GCODE_ROLES); kept open for new roles.
  role: string;
  fullName: string;
  email?: string;
  // ISO time the session expires; set on sessions read from the cookie.
  expiresAt?: string;
}

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === "ADMIN";
}

let cachedSecret: Uint8Array | null = null;

function secret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to at least 32 characters (openssl rand -base64 48)",
    );
  }
  cachedSecret = new TextEncoder().encode(value);
  return cachedSecret;
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({
    role: user.role,
    name: user.fullName,
    ...(user.email && { email: user.email }),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
    });
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      role: String(payload.role ?? "NONE"),
      fullName: String(payload.name ?? ""),
      ...(typeof payload.email === "string" && { email: payload.email }),
      ...(payload.exp && {
        expiresAt: new Date(payload.exp * 1000).toISOString(),
      }),
    };
  } catch {
    // Expired, tampered or signed with an old secret — treat as signed out.
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

// Only callable from route handlers / server functions (cookies can't be
// written during Server Component rendering).
export async function startSession(
  user: SessionUser,
): Promise<SessionUser & { expiresAt: string }> {
  const store = await cookies();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  store.set(SESSION_COOKIE, await signSession(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return { ...user, expiresAt: expiresAt.toISOString() };
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw AppError.unauthenticated();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user)) throw AppError.forbidden();
  return user;
}
