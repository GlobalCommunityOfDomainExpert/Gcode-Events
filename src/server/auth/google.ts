import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { AppError } from "@/server/http/errors";

// Verifies a Google Sign-In id_token locally against Google's published
// keys (cached by jose), replacing AUTH_PKG's call to the tokeninfo
// endpoint on every login.

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export interface GoogleIdentity {
  email: string;
  name: string | null;
}

function clientId(): string {
  // Same OAuth client the browser button uses.
  const id =
    process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!id)
    throw new Error(
      "GOOGLE_CLIENT_ID (or NEXT_PUBLIC_GOOGLE_CLIENT_ID) is not set",
    );
  return id;
}

export async function verifyGoogleIdToken(
  idToken: string,
): Promise<GoogleIdentity> {
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId(),
    }));
  } catch {
    throw AppError.unauthenticated("Invalid Google token");
  }

  if (typeof payload.email !== "string" || payload.email_verified !== true) {
    throw AppError.unauthenticated(
      "Invalid token audience or unverified email",
    );
  }
  return {
    email: payload.email,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}
