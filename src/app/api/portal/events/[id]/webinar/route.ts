import { handle, intParam, jsonBody, requireUser } from "@/server/portal/http";
import { getSettings, saveSettings } from "@/server/portal/live";

type P = { id: string };

export const GET = handle<P>(async (req, { id }) =>
  getSettings(intParam(id), requireUser(req)),
);

export const PUT = handle<P>(async (req, { id }) => {
  await saveSettings(intParam(id), requireUser(req), await jsonBody(req));
});
