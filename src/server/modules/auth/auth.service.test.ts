import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/session";
import type { AuthRepository, UserRow } from "./auth.repository";
import { selectRoleSchema } from "./auth.schemas";

const repo = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);

vi.mock("./auth.repository", () => ({
  getAuthRepository: async () => repo,
  inAuthTransaction: async (work: (r: unknown) => unknown) => work(repo),
}));
vi.mock("@/server/auth/google", () => ({
  verifyGoogleIdToken: vi.fn(async () => ({ email: "new@x.com", name: "New" })),
}));

const { authService } = await import("./auth.service");

const HASH = "a".repeat(64);
const LONG_ID = "331452637598741234567890123456789";

function user(over: Partial<UserRow> = {}): UserRow {
  return {
    user_id: LONG_ID,
    email: "Ada@x.com",
    full_name: "Ada",
    role_id: 1,
    role_name: "EXPERT",
    password_hash: HASH,
    ...over,
  };
}

function resetRepo() {
  const names: (keyof AuthRepository)[] = [
    "findUserByEmail",
    "findUserById",
    "findUserByCredentials",
    "findRoleId",
    "upsertPendingSignUp",
    "upsertPendingGuest",
    "markPendingVerified",
    "findVerifiedPending",
    "deletePending",
    "insertUser",
    "completeGuestUser",
    "setUserRole",
    "setPasswordByEmail",
    "replaceResetToken",
    "findResetEmail",
    "deleteResetToken",
    "sendOtpEmail",
    "sendResetEmail",
  ];
  for (const n of names) repo[n] = vi.fn(async () => null);
}

const rejects = (p: Promise<unknown>, code: string) =>
  expect(p).rejects.toMatchObject({ code });

beforeEach(resetRepo);

describe("signUp", () => {
  const input = {
    email: "ada@x.com",
    fullName: "Ada",
    phone: "1",
    password: HASH,
  };

  it("refuses an email that already has a password", async () => {
    repo.findUserByEmail.mockResolvedValue(user());
    await rejects(authService.signUp(input), "CONFLICT");
    expect(repo.sendOtpEmail).not.toHaveBeenCalled();
  });

  it("lets an Events guest (no password) claim their email", async () => {
    repo.findUserByEmail.mockResolvedValue(user({ password_hash: null }));
    await authService.signUp(input);
    expect(repo.upsertPendingSignUp).toHaveBeenCalled();
  });

  it("emails a 6-character upper-case alphanumeric code", async () => {
    await authService.signUp(input);
    const otp = repo.upsertPendingSignUp.mock.calls[0][0].otp;
    expect(otp).toMatch(/^[A-Z0-9]{6}$/);
    expect(repo.sendOtpEmail).toHaveBeenCalledWith("ada@x.com", "Ada", otp);
  });

  it("reports a failed email as UNAVAILABLE (and the transaction rolls back)", async () => {
    repo.sendOtpEmail.mockRejectedValue(new Error("smtp down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await rejects(authService.signUp(input), "UNAVAILABLE");
  });
});

describe("verifyOtp", () => {
  it("rejects a wrong or expired code", async () => {
    repo.markPendingVerified.mockResolvedValue(false);
    await rejects(
      authService.verifyOtp({ email: "a@x.com", code: "ZZZZZZ" }),
      "BAD_REQUEST",
    );
  });
});

describe("selectRole", () => {
  const input = { email: "ada@x.com", role: "EXPERT" as const };
  const pending = {
    email: "ada@x.com",
    full_name: "Ada",
    phone: "1",
    password_hash: HASH,
  };

  beforeEach(() => {
    repo.findRoleId.mockResolvedValue(1);
    repo.findUserById.mockResolvedValue(user());
  });

  it("is not available for ADMIN", () => {
    expect(
      selectRoleSchema.safeParse({ email: "a@x.com", role: "admin" }).success,
    ).toBe(false);
    expect(
      selectRoleSchema.parse({ email: "a@x.com", role: "expert" }).role,
    ).toBe("EXPERT");
  });

  it("creates the account from a verified sign-up and keeps the long id exact", async () => {
    repo.findVerifiedPending.mockResolvedValue(pending);
    repo.insertUser.mockResolvedValue(LONG_ID);
    const result = await authService.selectRole(input, null);
    expect(repo.insertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@x.com",
        passwordHash: HASH,
        roleId: 1,
      }),
    );
    expect(repo.deletePending).toHaveBeenCalledWith("ada@x.com");
    expect(result.userId).toBe(LONG_ID);
  });

  it("completes an existing guest account instead of creating a second one", async () => {
    repo.findVerifiedPending.mockResolvedValue(pending);
    repo.findUserByEmail.mockResolvedValue(user({ password_hash: null }));
    await authService.selectRole(input, null);
    expect(repo.completeGuestUser).toHaveBeenCalled();
    expect(repo.insertUser).not.toHaveBeenCalled();
  });

  it("never overwrites a full account", async () => {
    repo.findVerifiedPending.mockResolvedValue(pending);
    repo.findUserByEmail.mockResolvedValue(user());
    await rejects(authService.selectRole(input, null), "CONFLICT");
  });

  describe("first role for a Google account (no verified sign-up)", () => {
    const fresh = user({ role_id: null, role_name: null, password_hash: null });
    const owner: SessionUser = {
      userId: LONG_ID,
      role: "NONE",
      fullName: "Ada",
      email: "ada@x.com",
    };

    beforeEach(() => repo.findUserByEmail.mockResolvedValue(fresh));

    it("is refused without a session (the old account-takeover hole)", async () => {
      await rejects(authService.selectRole(input, null), "FORBIDDEN");
      expect(repo.setUserRole).not.toHaveBeenCalled();
    });

    it("is refused for someone else's session", async () => {
      await rejects(
        authService.selectRole(input, { ...owner, userId: "1" }),
        "FORBIDDEN",
      );
    });

    it("works for that account's own session", async () => {
      await authService.selectRole(input, owner);
      expect(repo.setUserRole).toHaveBeenCalledWith(LONG_ID, 1);
    });

    it("can't change a role that's already set", async () => {
      repo.findUserByEmail.mockResolvedValue(user());
      await rejects(authService.selectRole(input, owner), "FORBIDDEN");
    });
  });
});

describe("signIn", () => {
  it("rejects bad credentials", async () => {
    await rejects(
      authService.signIn({ email: "a@x.com", password: HASH }),
      "UNAUTHENTICATED",
    );
  });

  it("returns the session user, NONE when there's no role", async () => {
    repo.findUserByCredentials.mockResolvedValue(user({ role_name: null }));
    expect(
      await authService.signIn({ email: "a@x.com", password: HASH }),
    ).toEqual({
      userId: LONG_ID,
      role: "NONE",
      fullName: "Ada",
      email: "Ada@x.com",
    });
  });
});

describe("signInWithGoogle", () => {
  it("creates a role-less account on first use and asks for a role", async () => {
    repo.insertUser.mockResolvedValue(LONG_ID);
    repo.findUserById.mockResolvedValue(
      user({ role_id: null, role_name: null, password_hash: null }),
    );
    const { needsRole } = await authService.signInWithGoogle("token");
    expect(repo.insertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@x.com",
        passwordHash: null,
        roleId: null,
      }),
    );
    expect(needsRole).toBe(true);
  });
});

describe("password reset", () => {
  it("answers the same for unknown emails and sends nothing", async () => {
    const r = await authService.requestPasswordReset(
      { email: "nobody@x.com" },
      "https://app",
    );
    expect(r.message).toMatch(/If that email is registered/);
    expect(repo.sendResetEmail).not.toHaveBeenCalled();
  });

  it("sends a link on our own origin with a 64-hex token", async () => {
    repo.findUserByEmail.mockResolvedValue(user());
    await authService.requestPasswordReset(
      { email: "ada@x.com" },
      "https://gcode.in",
    );
    const [email, , link] = repo.sendResetEmail.mock.calls[0];
    expect(email).toBe("Ada@x.com");
    expect(link).toMatch(
      /^https:\/\/gcode\.in\/reset-password\?token=[0-9a-f]{64}$/,
    );
  });

  it("rejects an invalid or expired reset token", async () => {
    await rejects(
      authService.resetPassword({ token: "b".repeat(64), password: HASH }),
      "BAD_REQUEST",
    );
    expect(repo.setPasswordByEmail).not.toHaveBeenCalled();
  });
});
