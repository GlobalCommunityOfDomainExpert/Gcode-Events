import { z } from "zod";

// API contract for /api/v1/auth/*. Shared with src/lib/api/auth.ts.
//
// Passwords: the browser still sends SHA-256 hex (src/lib/auth/hash-password.ts)
// because that's what GCODE_USERS.PASSWORD_HASH holds today. Moving to a real
// server-side hash (Argon2id, rehash-on-login) is a separate change.
// TODO(auth): Argon2id + rehash on next successful sign-in.

// Emails are trimmed but NOT lower-cased: GCODE_PENDING_USERS is matched by
// exact email (here and inside the participant packages that check guest
// verification), so changing case would break registration.
const email = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Valid email is required");
const passwordHash = z.string().regex(/^[0-9a-f]{64}$/i, "Invalid password");

export const signUpSchema = z.object({
  email,
  fullName: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(30).optional(),
  password: passwordHash,
});

export const guestOtpSchema = z.object({
  email,
  fullName: z.string().trim().max(200).optional(),
});

export const verifyOtpSchema = z.object({
  email,
  code: z.string().trim().min(4).max(10),
  // Sent by the UI (REGISTRATION / guest) but not used by the check.
  purpose: z.string().optional(),
});

export const ROLE_NAMES = [
  "EXPERT",
  "FRESHER",
  "STARTUP",
  "INSTITUTION",
] as const;

export const selectRoleSchema = z.object({
  email,
  // ADMIN is deliberately not selectable here.
  role: z
    .string()
    .transform((r) => r.toUpperCase())
    .pipe(z.enum(ROLE_NAMES)),
});

export const signInSchema = z.object({ email, password: passwordHash });

export const googleSignInSchema = z.object({ idToken: z.string().min(10) });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z
    .string()
    .regex(/^[0-9a-f]{32,64}$/i, "Reset link is invalid or has expired"),
  password: passwordHash,
});

// What the browser learns about the signed-in user. Not a credential — the
// real session is the httpOnly cookie — just enough for the UI.
export interface AuthUser {
  userId: string;
  role: string;
  fullName: string;
  email: string;
  // ISO timestamp the session cookie expires at.
  expiresAt: string;
}

export interface GoogleSignInResult {
  user: AuthUser;
  // True when the account has no role yet and must pick one (select-role).
  needsRole: boolean;
}

export interface MessageResult {
  message: string;
}
