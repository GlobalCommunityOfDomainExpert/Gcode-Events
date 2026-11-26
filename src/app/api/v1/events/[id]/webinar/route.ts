import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/responses";
import {
  portalEventParamsSchema,
  saveWebinarBodySchema,
} from "@/server/modules/portal/portal.schemas";
import { webinarService } from "@/server/modules/portal/webinar.service";

// GET /api/v1/events/:id/webinar → { data: WebinarSettingsResult } (managers only)
export const GET = route(
  { params: portalEventParamsSchema },
  async ({ params, user }) => webinarService.settings(params.id, user.userId),
);

// PUT /api/v1/events/:id/webinar { audience?, recording?, … } → 204
// Room-shaping fields are refused once doors have opened.
export const PUT = route(
  { params: portalEventParamsSchema, body: saveWebinarBodySchema },
  async ({ params, body, user }) => {
    await webinarService.saveSettings(params.id, user.userId, body);
    return noContent();
  },
);
