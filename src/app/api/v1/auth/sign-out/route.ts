import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import { endSession } from "@/server/auth/session";

// POST /api/v1/auth/sign-out — always succeeds, signed in or not.
export const POST = route({ auth: "public" }, async () => {
  await endSession();
  return noContent();
});
