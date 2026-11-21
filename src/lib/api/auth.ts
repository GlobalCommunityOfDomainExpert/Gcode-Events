import { v1Request } from "./client";
import { clearSession, setSession } from "@/lib/auth/session";
import type {
  AuthUser,
  GoogleSignInResult,
  MessageResult,
} from "@/server/modules/auth/auth.schemas";

// /api/v1/auth/*. Request/response shapes come from the shared contract in
// src/server/modules/auth/auth.schemas.ts. Calls that sign the user in set
// the httpOnly session cookie server-side and store the profile snapshot
// here, so callers don't handle tokens at all.

// `password` is always the SHA-256 hex from hashPassword().
export function signUp(
  email: string,
  fullName: string,
  phone: string,
  password: string,
): Promise<MessageResult> {
  return v1Request("/auth/sign-up", {
    method: "POST",
    body: { email, fullName, phone, password },
  });
}

// Guest checkout email verification — no account is created.
export function sendGuestOtp(
  email: string,
  fullName?: string,
): Promise<MessageResult> {
  return v1Request("/auth/guest-otp", {
    method: "POST",
    body: { email, fullName },
  });
}

export function verifyOtp(
  email: string,
  code: string,
  purpose: string,
): Promise<MessageResult> {
  return v1Request("/auth/verify-otp", {
    method: "POST",
    body: { email, code, purpose },
  });
}

// Last sign-up step, or a first Google sign-in picking its role. Signs in.
export async function selectRole(
  email: string,
  role: string,
): Promise<AuthUser> {
  const user = await v1Request<AuthUser>("/auth/select-role", {
    method: "POST",
    body: { email, role },
  });
  setSession(user);
  return user;
}

export async function signIn(
  email: string,
  password: string,
): Promise<AuthUser> {
  const user = await v1Request<AuthUser>("/auth/sign-in", {
    method: "POST",
    body: { email, password },
  });
  setSession(user);
  return user;
}

export async function signInWithGoogle(
  idToken: string,
): Promise<GoogleSignInResult> {
  const result = await v1Request<GoogleSignInResult>("/auth/google", {
    method: "POST",
    body: { idToken },
  });
  setSession(result.user);
  return result;
}

export async function signOut(): Promise<void> {
  clearSession();
  // Best effort: the local profile is already gone, and an expired cookie
  // is rejected server-side anyway.
  await v1Request("/auth/sign-out", { method: "POST" }).catch(() => {});
}

// The reset link's origin is decided by the server.
export function requestPasswordReset(email: string): Promise<MessageResult> {
  return v1Request("/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

export function resetPassword(
  token: string,
  newPassword: string,
): Promise<MessageResult> {
  return v1Request("/auth/reset-password", {
    method: "POST",
    body: { token, password: newPassword },
  });
}
