import { createHash, randomBytes } from "node:crypto";

/** 256 bits from the OS CSPRNG, hex. Shown to the user once, never stored. */
export const newToken = () => randomBytes(32).toString("hex");

/** What the database keeps instead of the token. */
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
