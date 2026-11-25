import "server-only";
import { loadDatabaseConfig } from "./config";
import type { DatabaseClient, DatabaseConfig } from "./types";

// Entry point for everything database. Import from "@/infrastructure/database"
// only — never from ./drivers/* — so the vendor stays swappable.
//
// Server-only: this holds DB credentials and a native connection pool, and
// must never reach a client bundle (the "server-only" import enforces that
// at build time).

export type {
  BindParams,
  BindValue,
  CallParams,
  CallResult,
  OutBind,
  DatabaseClient,
  Queryable,
  QueryResult,
  Row,
  Transaction,
} from "./types";
export { DatabaseError, type DatabaseErrorCode } from "./errors";

async function createClient(config: DatabaseConfig): Promise<DatabaseClient> {
  switch (config.driver) {
    case "oracle": {
      // Imported lazily so only the selected driver's package is loaded.
      const { createOracleClient } = await import("./drivers/oracle");
      return createOracleClient(config);
    }
  }
}

// Cache on globalThis so Next's dev-mode hot reload reuses the pool instead
// of opening a new one on every module re-evaluation.
const globalForDb = globalThis as unknown as {
  __gcodeDb?: Promise<DatabaseClient>;
};

export function getDatabase(): Promise<DatabaseClient> {
  if (!globalForDb.__gcodeDb) {
    globalForDb.__gcodeDb = createClient(loadDatabaseConfig()).catch((err) => {
      // Don't cache a failed init — let the next call retry.
      globalForDb.__gcodeDb = undefined;
      throw err;
    });
  }
  return globalForDb.__gcodeDb;
}

export async function closeDatabase(): Promise<void> {
  const pending = globalForDb.__gcodeDb;
  globalForDb.__gcodeDb = undefined;
  if (pending) await (await pending).close();
}
