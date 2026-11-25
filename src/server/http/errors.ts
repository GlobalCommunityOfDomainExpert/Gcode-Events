import "server-only";
import { ZodError } from "zod";
import { DatabaseError } from "@/infrastructure/database";

// The single error type the API layer understands. Services throw these (or
// let DatabaseError bubble up); route() turns them into the JSON envelope.

export type AppErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INTERNAL";

const STATUS: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }

  static notFound(what = "Resource") {
    return new AppError("NOT_FOUND", `${what} not found`);
  }
  static unauthenticated(message = "Please sign in to continue") {
    return new AppError("UNAUTHENTICATED", message);
  }
  static forbidden(message = "You don't have access to this") {
    return new AppError("FORBIDDEN", message);
  }
  static badRequest(message: string) {
    return new AppError("BAD_REQUEST", message);
  }
}

// Normalises anything thrown inside a handler. Only messages we know are
// user-safe are passed through; everything else becomes a generic 500 and
// is logged by the caller.
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return new AppError("VALIDATION", "Invalid request", err.issues);
  }

  if (DatabaseError.is(err)) {
    switch (err.code) {
      // Business-rule text written for users (e.g. "Registration has
      // closed") — the UI displays it as-is.
      case "APPLICATION_ERROR":
        return new AppError("BAD_REQUEST", err.message);
      case "UNIQUE_VIOLATION":
        return new AppError("CONFLICT", "This record already exists");
      case "FOREIGN_KEY_VIOLATION":
      case "NOT_NULL_VIOLATION":
      case "CHECK_VIOLATION":
        return new AppError("BAD_REQUEST", "The request contains invalid data");
      case "CONNECTION_FAILED":
        return new AppError(
          "UNAVAILABLE",
          "Service temporarily unavailable, please try again",
        );
    }
  }

  return new AppError("INTERNAL", "Something went wrong, please try again");
}
