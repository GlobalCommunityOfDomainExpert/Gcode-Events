import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import type { SessionUser } from "@/server/auth/session";
import { verifyGoogleIdToken } from "@/server/auth/google";
import { AppError } from "@/server/http/errors";
import {
  getAuthRepository,
  inAuthTransaction,
  type AuthRepository,
  type UserRow,
} from "./auth.repository";
import type { z } from "zod";
import type {
  forgotPasswordSchema,
  guestOtpSchema,
  resetPasswordSchema,
  selectRoleSchema,
  signInSchema,
  signUpSchema,
  verifyOtpSchema,
} from "./auth.schemas";

// Account rules, ported from AUTH_PKG. The routes turn the SessionUser these
// return into the session cookie; nothing here knows about HTTP.

const OTP_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Same shape as DBMS_RANDOM.STRING('X', 6): six upper-case alphanumerics.
function generateOtp(): string {
  let otp = "";
  for (let i = 0; i < 6; i++)
    otp += OTP_ALPHABET[randomInt(OTP_ALPHABET.length)];
  return otp;
}

function toSessionUser(row: UserRow): SessionUser {
  return {
    userId: row.user_id,
    // A user with no role yet (fresh Google sign-in) is "NONE", as before.
    role: row.role_name?.toUpperCase() ?? "NONE",
    fullName: row.full_name,
    email: row.email,
  };
}

async function sendOrFail(send: () => Promise<void>): Promise<void> {
  try {
    await send();
  } catch (err) {
    console.error("[auth] email send failed", err);
    throw new AppError(
      "UNAVAILABLE",
      "We couldn't send the email right now, please try again",
    );
  }
}

const sameEmail = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const authService = {
  // Step 1 of sign-up: park the details and email a code. The account
  // itself is only created by selectRole() once the code is verified.
  async signUp(input: z.output<typeof signUpSchema>) {
    const repo = await getAuthRepository();
    const existing = await repo.findUserByEmail(input.email);
    // One person, one account: a password-holding account signs in instead.
    // A guest account (no password) is claimed by finishing sign-up.
    if (existing?.password_hash) {
      throw new AppError("CONFLICT", "Email already exists");
    }

    const otp = generateOtp();
    await inAuthTransaction(async (tx) => {
      await tx.upsertPendingSignUp({
        email: input.email,
        fullName: input.fullName,
        phone: input.phone ?? null,
        passwordHash: input.password,
        otp,
      });
      await sendOrFail(() => tx.sendOtpEmail(input.email, input.fullName, otp));
    });
    return { message: "OTP sent to email" };
  },

  // Guest checkout email verification — no account is created.
  async sendGuestOtp(input: z.output<typeof guestOtpSchema>) {
    const otp = generateOtp();
    await inAuthTransaction(async (tx) => {
      await tx.upsertPendingGuest({
        email: input.email,
        fullName: input.fullName ?? null,
        otp,
      });
      await sendOrFail(() =>
        tx.sendOtpEmail(input.email, input.fullName || "there", otp),
      );
    });
    return { message: "OTP sent to email" };
  },

  async verifyOtp(input: z.output<typeof verifyOtpSchema>) {
    const repo = await getAuthRepository();
    if (!(await repo.markPendingVerified(input.email, input.code))) {
      throw AppError.badRequest("Invalid or expired OTP");
    }
    return { message: "OTP verified successfully" };
  },

  // Final sign-up step (and the role picker after a first Google sign-in).
  async selectRole(
    input: z.output<typeof selectRoleSchema>,
    session: SessionUser | null,
  ): Promise<SessionUser> {
    return inAuthTransaction(async (tx) => {
      const roleId = await tx.findRoleId(input.role);
      if (roleId === null) throw AppError.notFound("Role");

      const userId =
        (await completeVerifiedSignUp(tx, input.email, roleId)) ??
        (await assignFirstRole(tx, input.email, roleId, session));

      const user = await tx.findUserById(userId);
      if (!user) throw AppError.notFound("Account");
      return toSessionUser(user);
    });
  },

  async signIn(input: z.output<typeof signInSchema>): Promise<SessionUser> {
    const repo = await getAuthRepository();
    const user = await repo.findUserByCredentials(input.email, input.password);
    if (!user) throw AppError.unauthenticated("Invalid email or password");
    return toSessionUser(user);
  },

  async signInWithGoogle(
    idToken: string,
  ): Promise<{ user: SessionUser; needsRole: boolean }> {
    const google = await verifyGoogleIdToken(idToken);
    const repo = await getAuthRepository();

    let user = await repo.findUserByEmail(google.email);
    if (!user) {
      const userId = await repo.insertUser({
        email: google.email,
        fullName: google.name ?? "User",
        phone: null,
        passwordHash: null,
        roleId: null,
      });
      user = await repo.findUserById(userId);
      if (!user) throw AppError.notFound("Account");
    }
    return { user: toSessionUser(user), needsRole: user.role_id === null };
  },

  // `origin` comes from the server (APP_URL or the request), never from the
  // client body — otherwise anyone could make us email a reset link that
  // points at their own site.
  async requestPasswordReset(
    input: z.output<typeof forgotPasswordSchema>,
    origin: string,
  ) {
    const message = "If that email is registered, a reset link has been sent";
    const repo = await getAuthRepository();
    const user = await repo.findUserByEmail(input.email);
    // Same answer either way, so this can't be used to probe for accounts.
    if (!user) return { message };

    const token = randomBytes(32).toString("hex");
    const link = `${origin}/reset-password?token=${token}`;
    await inAuthTransaction(async (tx) => {
      await tx.replaceResetToken(user.email, token);
      await sendOrFail(() =>
        tx.sendResetEmail(user.email, user.full_name, link),
      );
    });
    return { message };
  },

  async resetPassword(input: z.output<typeof resetPasswordSchema>) {
    await inAuthTransaction(async (tx) => {
      const email = await tx.findResetEmail(input.token);
      if (!email)
        throw AppError.badRequest("Reset link is invalid or has expired");
      await tx.setPasswordByEmail(email, input.password);
      await tx.deleteResetToken(input.token);
    });
    return { message: "Password updated" };
  },
};

// Verified sign-up → create the account, or complete the Events guest
// account that already uses this email (never a second account).
// Returns null when there's no verified sign-up for the email.
async function completeVerifiedSignUp(
  tx: AuthRepository,
  email: string,
  roleId: number,
): Promise<string | null> {
  const pending = await tx.findVerifiedPending(email);
  if (!pending) return null;

  const existing = await tx.findUserByEmail(email);
  let userId: string;
  if (existing) {
    if (existing.password_hash) {
      throw new AppError("CONFLICT", "Email already exists");
    }
    await tx.completeGuestUser({ userId: existing.user_id, pending, roleId });
    userId = existing.user_id;
  } else {
    userId = await tx.insertUser({
      email: pending.email,
      fullName: pending.full_name ?? "User",
      phone: pending.phone,
      passwordHash: pending.password_hash,
      roleId,
    });
  }
  await tx.deletePending(email);
  return userId;
}

// No verified sign-up: this is a signed-in account (first Google sign-in)
// choosing its role for the first time.
//
// AUTH_PKG allowed this for ANY email with no role, with no proof of who
// was asking — anyone could take over a fresh Google account by knowing its
// email. Now the caller must be signed in as that account.
async function assignFirstRole(
  tx: AuthRepository,
  email: string,
  roleId: number,
  session: SessionUser | null,
): Promise<string> {
  const notAllowed = new AppError(
    "FORBIDDEN",
    "Email not verified or session expired",
  );
  const existing = await tx.findUserByEmail(email);
  if (!existing || existing.role_id !== null) throw notAllowed;
  if (
    !session ||
    session.userId !== existing.user_id ||
    !sameEmail(session.email ?? "", existing.email)
  ) {
    throw notAllowed;
  }
  await tx.setUserRole(existing.user_id, roleId);
  return existing.user_id;
}
