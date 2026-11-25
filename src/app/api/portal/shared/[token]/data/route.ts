import { handle } from "@/server/portal/http";
import { sharedData } from "@/server/portal/team";

// What the role may see, filtered on the server. Never emails or phones.
export const GET = handle<{ token: string }>(async (_req, { token }) =>
  sharedData(token),
);
