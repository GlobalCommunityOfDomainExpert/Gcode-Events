import "server-only";
import { getDatabase, type Queryable } from "@/infrastructure/database";

// Opaque handle a service passes to repository factories so their writes
// share one transaction. Services never run SQL with it themselves.
export type TransactionHandle = Queryable;

// Commits when `work` resolves, rolls back if it throws.
export async function transaction<T>(
  work: (tx: TransactionHandle) => Promise<T>,
): Promise<T> {
  const db = await getDatabase();
  return db.transaction(work);
}

// What repository factories accept: a transaction handle, or nothing for a
// standalone (auto-committed) call per statement.
export type DbSource = () => Promise<Queryable>;

export const standalone: DbSource = getDatabase;

export const within =
  (tx: TransactionHandle): DbSource =>
  async () =>
    tx;
