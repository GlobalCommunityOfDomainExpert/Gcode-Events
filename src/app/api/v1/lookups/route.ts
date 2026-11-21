import { route } from "@/server/http/handler";
import { ok } from "@/server/http/responses";
import { lookupsService } from "@/server/modules/lookups/lookups.service";

// Reference data changes only when an admin edits the tables, so let the
// browser/CDN reuse it for a few minutes.
const CACHE = {
  headers: {
    "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
  },
};

// GET /api/v1/lookups → { data: { eventTypes, statuses, modes, categories } }
export const GET = route({ auth: "public" }, async () =>
  ok(await lookupsService.all(), CACHE),
);
