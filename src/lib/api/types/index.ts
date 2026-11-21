// Wire types of the legacy ORDS endpoints, one file per domain. Each domain
// moves to its own contract in src/server/modules/<domain>/*.schemas.ts as
// it leaves ORDS, and its file here is deleted. Import from "@/lib/api/types".
export type { ApiListResponse } from "./common";
