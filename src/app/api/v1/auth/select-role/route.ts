import { route } from "@/server/http/handler";
import { signInAs } from "@/server/modules/auth/auth.mapper";
import { selectRoleSchema } from "@/server/modules/auth/auth.schemas";
import { authService } from "@/server/modules/auth/auth.service";

// POST /api/v1/auth/select-role — finishes sign-up (after verify-otp) or
// sets a first-time Google account's role (needs that account's session).
// Signs the user in.
export const POST = route(
  { auth: "public", body: selectRoleSchema },
  async ({ body, user }) => signInAs(await authService.selectRole(body, user)),
);
