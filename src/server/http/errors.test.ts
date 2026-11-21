import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DatabaseError } from "@/infrastructure/database/errors";
import { AppError, toAppError } from "./errors";

describe("toAppError", () => {
  it("passes AppError through untouched", () => {
    const err = AppError.notFound("Event");
    expect(toAppError(err)).toBe(err);
    expect(err.status).toBe(404);
    expect(err.message).toBe("Event not found");
  });

  it("turns zod failures into VALIDATION with the issues as details", () => {
    const result = z.object({ id: z.number() }).safeParse({ id: "x" });
    const err = toAppError(result.error);
    expect(err.code).toBe("VALIDATION");
    expect(err.status).toBe(400);
    expect(Array.isArray(err.details)).toBe(true);
  });

  it("shows PL/SQL business-rule messages to the user", () => {
    const err = toAppError(
      new DatabaseError("Registration has closed", "APPLICATION_ERROR"),
    );
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toBe("Registration has closed");
  });

  it("recognises a DatabaseError from another copy of the module", async () => {
    // The cached DB client can outlive a dev reload and throw the old
    // module's class.
    vi.resetModules();
    const { DatabaseError: OtherCopy } =
      await import("@/infrastructure/database/errors");
    expect(OtherCopy).not.toBe(DatabaseError);
    const err = toAppError(
      new OtherCopy("Registration has closed", "APPLICATION_ERROR"),
    );
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toBe("Registration has closed");
  });

  it("maps constraint and connection errors without leaking SQL", () => {
    const dup = toAppError(
      new DatabaseError(
        "ORA-00001: unique constraint (X.Y) violated",
        "UNIQUE_VIOLATION",
      ),
    );
    expect(dup.code).toBe("CONFLICT");
    expect(dup.message).not.toMatch(/ORA-/);

    const down = toAppError(new DatabaseError("NJS-503", "CONNECTION_FAILED"));
    expect(down.code).toBe("UNAVAILABLE");
    expect(down.status).toBe(503);
  });

  it("hides unknown errors behind a generic INTERNAL", () => {
    const err = toAppError(
      new Error("ORA-00942: table or view does not exist"),
    );
    expect(err.code).toBe("INTERNAL");
    expect(err.status).toBe(500);
    expect(err.message).not.toMatch(/ORA-/);
  });
});
