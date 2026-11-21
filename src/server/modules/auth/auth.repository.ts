import "server-only";
import { getDatabase, type Queryable } from "@/infrastructure/database";

// SQL for accounts, OTPs and password resets — a port of AUTH_PKG, which
// can't be called from here because it answers through ORDS (HTP.print).
//
// USER_ID is a 30-40 digit number made from SYS_GUID (trigger
// GCODE_USERS_BIU), past JS number precision — always TO_CHAR it.

export interface UserRow {
  user_id: string;
  email: string;
  full_name: string;
  role_id: number | null;
  role_name: string | null;
  password_hash: string | null;
  [key: string]: unknown;
}

export interface PendingUserRow {
  email: string;
  full_name: string | null;
  phone: string | null;
  password_hash: string | null;
  [key: string]: unknown;
}

const USER_COLUMNS = `TO_CHAR(u.user_id) AS user_id, u.email, u.full_name,
  u.role_id, r.role_name, u.password_hash`;

function authRepository(db: Queryable) {
  return {
    async findUserByEmail(email: string): Promise<UserRow | null> {
      return db.queryOne<UserRow>(
        `SELECT ${USER_COLUMNS}
           FROM gcode_users u LEFT JOIN gcode_roles r ON r.role_id = u.role_id
          WHERE LOWER(u.email) = LOWER(:email)
          FETCH FIRST 1 ROW ONLY`,
        { email },
      );
    },

    async findUserById(userId: string): Promise<UserRow | null> {
      return db.queryOne<UserRow>(
        `SELECT ${USER_COLUMNS}
           FROM gcode_users u LEFT JOIN gcode_roles r ON r.role_id = u.role_id
          WHERE u.user_id = TO_NUMBER(:userId)`,
        { userId },
      );
    },

    async findUserByCredentials(
      email: string,
      passwordHash: string,
    ): Promise<UserRow | null> {
      return db.queryOne<UserRow>(
        `SELECT ${USER_COLUMNS}
           FROM gcode_users u LEFT JOIN gcode_roles r ON r.role_id = u.role_id
          WHERE LOWER(u.email) = LOWER(:email) AND u.password_hash = :passwordHash
          FETCH FIRST 1 ROW ONLY`,
        { email, passwordHash },
      );
    },

    async findRoleId(roleName: string): Promise<number | null> {
      const row = await db.queryOne<{ role_id: number }>(
        "SELECT role_id FROM gcode_roles WHERE UPPER(role_name) = UPPER(:roleName)",
        { roleName },
      );
      return row?.role_id ?? null;
    },

    // ── Pending sign-ups / guest OTPs (GCODE_PENDING_USERS) ──────────────

    async upsertPendingSignUp(p: {
      email: string;
      fullName: string;
      phone: string | null;
      passwordHash: string;
      otp: string;
    }): Promise<void> {
      await db.execute(
        `MERGE INTO gcode_pending_users t
         USING (SELECT :email AS email FROM dual) s ON (t.email = s.email)
         WHEN MATCHED THEN UPDATE SET
           full_name = :fullName, phone = :phone, password_hash = :passwordHash,
           otp_code = :otp, expires_at = SYSTIMESTAMP + INTERVAL '15' MINUTE,
           is_verified = 'N'
         WHEN NOT MATCHED THEN
           INSERT (email, full_name, phone, password_hash, otp_code, expires_at)
           VALUES (:email, :fullName, :phone, :passwordHash, :otp,
                   SYSTIMESTAMP + INTERVAL '15' MINUTE)`,
        p,
      );
    },

    // Guest checkout: verifies an email without creating an account, and
    // never touches a password already on the pending row.
    async upsertPendingGuest(p: {
      email: string;
      fullName: string | null;
      otp: string;
    }): Promise<void> {
      await db.execute(
        `MERGE INTO gcode_pending_users t
         USING (SELECT :email AS email FROM dual) s ON (t.email = s.email)
         WHEN MATCHED THEN UPDATE SET
           full_name = NVL(t.full_name, :fullName),
           otp_code = :otp, expires_at = SYSTIMESTAMP + INTERVAL '15' MINUTE,
           is_verified = 'N'
         WHEN NOT MATCHED THEN
           INSERT (email, full_name, otp_code, expires_at)
           VALUES (:email, :fullName, :otp, SYSTIMESTAMP + INTERVAL '15' MINUTE)`,
        p,
      );
    },

    // True when the code matched an unexpired OTP.
    async markPendingVerified(email: string, code: string): Promise<boolean> {
      const updated = await db.execute(
        `UPDATE gcode_pending_users SET is_verified = 'Y'
          WHERE email = :email
            AND UPPER(TRIM(otp_code)) = UPPER(TRIM(:code))
            AND expires_at > SYSTIMESTAMP`,
        { email, code },
      );
      return updated > 0;
    },

    async findVerifiedPending(email: string): Promise<PendingUserRow | null> {
      return db.queryOne<PendingUserRow>(
        `SELECT email, full_name, phone, password_hash
           FROM gcode_pending_users WHERE email = :email AND is_verified = 'Y'`,
        { email },
      );
    },

    async deletePending(email: string): Promise<void> {
      await db.execute("DELETE FROM gcode_pending_users WHERE email = :email", {
        email,
      });
    },

    // ── Accounts (GCODE_USERS) ───────────────────────────────────────────

    async insertUser(p: {
      email: string;
      fullName: string;
      phone: string | null;
      passwordHash: string | null;
      roleId: number | null;
    }): Promise<string> {
      const out = await db.call<{ userId: string }>(
        `INSERT INTO gcode_users (email, full_name, phone, password_hash, role_id)
         VALUES (:email, :fullName, :phone, :passwordHash, :roleId)
         RETURNING TO_CHAR(user_id) INTO :userId`,
        { ...p, userId: { out: "string" } },
      );
      return out.userId;
    },

    // Completes an Events guest account (no password yet) from a verified
    // sign-up, filling only what's missing.
    async completeGuestUser(p: {
      userId: string;
      pending: PendingUserRow;
      roleId: number;
    }): Promise<void> {
      await db.execute(
        `UPDATE gcode_users SET
           password_hash = NVL(:passwordHash, password_hash),
           role_id       = NVL(role_id, :roleId),
           full_name     = NVL(full_name, :fullName),
           phone         = NVL(phone, :phone)
         WHERE user_id = TO_NUMBER(:userId)`,
        {
          userId: p.userId,
          roleId: p.roleId,
          passwordHash: p.pending.password_hash,
          fullName: p.pending.full_name,
          phone: p.pending.phone,
        },
      );
    },

    async setUserRole(userId: string, roleId: number): Promise<void> {
      await db.execute(
        "UPDATE gcode_users SET role_id = :roleId WHERE user_id = TO_NUMBER(:userId)",
        { userId, roleId },
      );
    },

    async setPasswordByEmail(
      email: string,
      passwordHash: string,
    ): Promise<void> {
      await db.execute(
        "UPDATE gcode_users SET password_hash = :passwordHash WHERE email = :email",
        { email, passwordHash },
      );
    },

    // ── Password resets (GCODE_PASSWORD_RESETS) ──────────────────────────

    async replaceResetToken(email: string, token: string): Promise<void> {
      await db.execute(
        "DELETE FROM gcode_password_resets WHERE email = :email",
        {
          email,
        },
      );
      await db.execute(
        `INSERT INTO gcode_password_resets (token, email, expires_at)
         VALUES (:token, :email, SYSTIMESTAMP + INTERVAL '30' MINUTE)`,
        { token, email },
      );
    },

    async findResetEmail(token: string): Promise<string | null> {
      const row = await db.queryOne<{ email: string }>(
        `SELECT email FROM gcode_password_resets
          WHERE token = :token AND expires_at > SYSTIMESTAMP`,
        { token },
      );
      return row?.email ?? null;
    },

    async deleteResetToken(token: string): Promise<void> {
      await db.execute(
        "DELETE FROM gcode_password_resets WHERE token = :token",
        {
          token,
        },
      );
    },

    // ── Email (still APEX_MAIL via GCODE_EMAIL_API, shared with the other
    // app; moves to src/infrastructure/email in Phase 2) ─────────────────

    async sendOtpEmail(
      email: string,
      fullName: string,
      otp: string,
    ): Promise<void> {
      await db.call(
        "BEGIN gcode_email_api.send_otp_email(:email, :fullName, :otp); END;",
        { email, fullName, otp },
      );
    },

    async sendResetEmail(
      email: string,
      fullName: string,
      link: string,
    ): Promise<void> {
      await db.call(
        "BEGIN gcode_email_api.send_reset_email(:email, :fullName, :link); END;",
        { email, fullName, link },
      );
    },
  };
}

export type AuthRepository = ReturnType<typeof authRepository>;

export async function getAuthRepository(): Promise<AuthRepository> {
  return authRepository(await getDatabase());
}

// Runs `work` in one transaction: everything commits together or not at all
// (e.g. an OTP row is never saved if its email fails to send).
export async function inAuthTransaction<T>(
  work: (repo: AuthRepository) => Promise<T>,
): Promise<T> {
  const db = await getDatabase();
  return db.transaction((tx) => work(authRepository(tx)));
}
