// Vendor-neutral database contract. Application code depends only on these
// types — never on oracledb (or any other driver) directly — so the backing
// database can be swapped by adding a driver under ./drivers and changing
// DB_DRIVER, without touching callers.

export type DatabaseDriver = "oracle";

// Bind values the abstraction promises every driver can handle. Keep this
// conservative: anything vendor-specific (Oracle cursors, Postgres arrays…)
// stays inside its driver.
export type BindValue = string | number | boolean | Date | Buffer | null;

// SQL uses named placeholders (`:name`) in every driver. Oracle supports
// them natively; drivers for databases that don't (e.g. Postgres' `$1`)
// rewrite them before executing.
export type BindParams = Record<string, BindValue>;

export type Row = Record<string, unknown>;

export interface QueryResult<T extends Row = Row> {
  rows: T[];
  // Rows inserted/updated/deleted by a DML statement; 0 for SELECTs.
  rowsAffected: number;
}

// Marks a stored-procedure parameter as an output. "cursor" is a result set
// returned through a parameter (Oracle REF CURSOR, Postgres refcursor); the
// driver reads it fully and hands back its rows.
export type OutBind = { out: "number" | "string" | "date" | "cursor" };

export type CallParams = Record<string, BindValue | OutBind>;

// Output values keyed by parameter name. Cursor outputs arrive as Row[].
export type CallResult = Record<string, unknown>;

export interface Queryable {
  // Runs a statement and returns its rows. Column names are lower-cased so
  // results look the same regardless of the vendor's identifier casing.
  query<T extends Row = Row>(
    sql: string,
    params?: BindParams,
  ): Promise<QueryResult<T>>;

  // Convenience: first row or null.
  queryOne<T extends Row = Row>(
    sql: string,
    params?: BindParams,
  ): Promise<T | null>;

  // Runs a DML/DDL statement and returns the affected row count.
  execute(sql: string, params?: BindParams): Promise<number>;

  // Runs a stored-procedure block and returns its OUT parameters, e.g.
  //   call("BEGIN pkg.get_thing(:id, :result); END;",
  //        { id: 1, result: { out: "cursor" } })
  // Exists so the stored-procedure business logic can be called while it's
  // still being ported out of the database; new code should prefer
  // query/execute.
  call<T extends CallResult = CallResult>(
    sql: string,
    params?: CallParams,
  ): Promise<T>;
}

// A unit of work bound to a single connection. Committed when the
// transaction callback resolves, rolled back when it throws.
export type Transaction = Queryable;

export interface DatabaseClient extends Queryable {
  readonly driver: DatabaseDriver;

  transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;

  // Cheap round-trip for health checks.
  ping(): Promise<void>;

  // Drains the pool. Call on shutdown; the client is unusable afterwards.
  close(): Promise<void>;
}

export interface PoolConfig {
  min: number;
  max: number;
  // Seconds an idle connection stays open before the pool reaps it.
  idleTimeoutSeconds: number;
}

export interface OracleConfig {
  driver: "oracle";
  user: string;
  password: string;
  // EZConnect (host:port/service), a TNS alias from tnsnames.ora, or a full
  // descriptor — whatever the Autonomous DB console hands out.
  connectString: string;
  // Directory holding tnsnames.ora / ewallet.pem for mTLS wallets. Omit for
  // TLS-only (walletless) Autonomous DB connections.
  walletDir?: string;
  walletPassword?: string;
  // Schema that unqualified names resolve to. Set when connecting as a
  // least-privilege app user that doesn't own the tables.
  schema?: string;
  pool: PoolConfig;
}

// Add new driver configs to this union as drivers are added.
export type DatabaseConfig = OracleConfig;
