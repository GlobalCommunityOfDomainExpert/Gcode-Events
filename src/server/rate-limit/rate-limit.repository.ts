import "server-only";
import { standalone, type DbSource } from "@/server/db/transaction";

// Fixed-window counters in GCODE_RATE_LIMITS (docs/sql/rate-limits). Each
// hit is one standalone, auto-committed call, so concurrent requests from
// any app instance share the same count.

export function createRateLimitRepository(source: DbSource = standalone) {
  return {
    // Counts one hit on `key` and returns the count and start of its current
    // window (a window older than `windowSec` restarts at 1).
    async hit(
      key: string,
      windowSec: number,
    ): Promise<{ hits: number; windowStart: Date }> {
      const db = await source();
      return db.call<{ hits: number; windowStart: Date }>(
        `DECLARE
           l_key VARCHAR2(120) := :key;
           l_cut TIMESTAMP WITH TIME ZONE :=
             SYSTIMESTAMP - NUMTODSINTERVAL(:windowSec, 'SECOND');
           PROCEDURE bump IS
           BEGIN
             UPDATE gcode_rate_limits
                SET hits = CASE WHEN window_start <= l_cut THEN 1 ELSE hits + 1 END,
                    window_start = CASE WHEN window_start <= l_cut
                                        THEN SYSTIMESTAMP ELSE window_start END
              WHERE bucket_key = l_key
             RETURNING hits, window_start INTO :hits, :windowStart;
           END;
         BEGIN
           bump;
           IF SQL%ROWCOUNT = 0 THEN
             BEGIN
               INSERT INTO gcode_rate_limits (bucket_key, window_start, hits)
               VALUES (l_key, SYSTIMESTAMP, 1)
               RETURNING hits, window_start INTO :hits, :windowStart;
             EXCEPTION
               -- Another request created the row first.
               WHEN DUP_VAL_ON_INDEX THEN bump;
             END;
           END IF;
         END;`,
        {
          key,
          windowSec,
          hits: { out: "number" },
          windowStart: { out: "date" },
        },
      );
    },

    // Longest window in use is an hour; a day keeps the table tiny.
    async prune(): Promise<void> {
      const db = await source();
      await db.execute(
        `DELETE FROM gcode_rate_limits
          WHERE window_start < SYSTIMESTAMP - INTERVAL '1' DAY`,
      );
    },
  };
}

export const rateLimitRepository = createRateLimitRepository();
