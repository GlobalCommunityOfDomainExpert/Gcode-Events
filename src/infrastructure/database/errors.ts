// Drivers wrap their native errors in DatabaseError so callers can catch one
// type and branch on `code` without knowing which database is behind it.

export type DatabaseErrorCode =
  | "CONNECTION_FAILED"
  | "UNIQUE_VIOLATION"
  | "FOREIGN_KEY_VIOLATION"
  | "NOT_NULL_VIOLATION"
  | "CHECK_VIOLATION"
  // A business-rule error raised deliberately by database code (Oracle
  // RAISE_APPLICATION_ERROR, Postgres RAISE EXCEPTION). `message` is the
  // human-readable text with vendor prefixes stripped — safe to show users.
  | "APPLICATION_ERROR"
  | "QUERY_FAILED"
  | "CONFIG_INVALID";

// Shared across module copies: the client is cached on globalThis (see
// index.ts), so after a dev reload — or from another route bundle — it can
// throw a DatabaseError from a different copy of this file, and
// `instanceof` would miss it. Check with DatabaseError.is() instead.
const BRAND = Symbol.for("gcode.DatabaseError");

export class DatabaseError extends Error {
  readonly [BRAND] = true;

  static is(err: unknown): err is DatabaseError {
    return (
      typeof err === "object" &&
      err !== null &&
      (err as Record<symbol, unknown>)[BRAND] === true
    );
  }

  constructor(
    message: string,
    public readonly code: DatabaseErrorCode,
    // The driver's own error, kept for logging. Don't branch on it in app
    // code — that re-couples you to the vendor.
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}
