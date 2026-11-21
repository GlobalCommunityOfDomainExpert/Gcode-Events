import { handle, intParam, requireUser } from "@/server/portal/http";
import { joinCredential } from "@/server/portal/live";

type P = { id: string };

export const POST = handle<P>(async (req, { id }) =>
  joinCredential(intParam(id), requireUser(req)),
);
