import "server-only";
import { NextResponse } from "next/server";
import type { AppError } from "./errors";
import type { PageInfo } from "./contract";

// Every /api/v1 response uses one of these, so the client only ever has to
// understand `{ data }`, `{ data, page }` or `{ error }`.

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function paginated<T>(data: T[], page: PageInfo, init?: ResponseInit) {
  return NextResponse.json({ data, page }, init);
}

export function fail(error: AppError) {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && { details: error.details }),
      },
    },
    { status: error.status },
  );
}
