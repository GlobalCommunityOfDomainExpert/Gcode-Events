import { z } from "zod";

// Wire-format types shared by the server (responses.ts) and the browser
// client (src/lib/api/client.ts). No "server-only" here on purpose — this
// file must stay importable from client components.

export interface PageInfo {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

// Standard ?limit=&offset= parsing for list endpoints.
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
