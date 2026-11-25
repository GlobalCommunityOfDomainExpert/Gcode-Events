import { z } from "zod";
import { route } from "@/server/http/handler";
import { ok } from "@/server/http/responses";
import { lookupKindSchema } from "@/server/modules/lookups/lookups.schemas";
import { lookupsService } from "@/server/modules/lookups/lookups.service";

const CACHE = {
  headers: {
    "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
  },
};

// GET /api/v1/lookups/{event-types|statuses|modes|categories} → { data: [...] }
export const GET = route(
  { auth: "public", params: z.object({ kind: lookupKindSchema }) },
  async ({ params }) => ok(await lookupsService.byKind(params.kind), CACHE),
);
