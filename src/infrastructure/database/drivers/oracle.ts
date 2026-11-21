import oracledb from "oracledb";
import { DatabaseError, type DatabaseErrorCode } from "../errors";
import type {
  BindParams,
  BindValue,
  CallParams,
  CallResult,
  DatabaseClient,
  OracleConfig,
  OutBind,
  QueryResult,
  Row,
  Transaction,
} from "../types";

// node-oracledb 6+ runs in Thin mode unless initOracleClient() is called, so
// no Instant Client is needed — it's pure JS talking TCP/TLS straight to the
// database. Don't call initOracleClient() anywhere or this flips to Thick.

// DATE / TIMESTAMP (no time zone) are read as UTC. The driver would otherwise
// build the Date in the Node process's local zone, so the same row would
// mean different instants on different servers. (ORDS, and the ADB session
// default, treat them as UTC too.) TIMESTAMP WITH TIME ZONE is unaffected.
function naiveAsUtc(value: Date | null): Date | null {
  if (!value) return value;
  return new Date(
    Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
      value.getMilliseconds(),
    ),
  );
}

oracledb.fetchTypeHandler = (meta) => {
  switch (meta.dbType) {
    // Return LOBs as plain values instead of streaming Lob objects so rows
    // stay serialisable and look the same as any other driver's output.
    case oracledb.DB_TYPE_CLOB:
    case oracledb.DB_TYPE_NCLOB:
      return { type: oracledb.STRING };
    case oracledb.DB_TYPE_BLOB:
      return { type: oracledb.BUFFER };
    case oracledb.DB_TYPE_DATE:
    case oracledb.DB_TYPE_TIMESTAMP:
      return {
        converter: (value: unknown) => naiveAsUtc(value as Date | null),
      };
  }
  return undefined;
};

const ORA_ERROR_CODES: Record<number, DatabaseErrorCode> = {
  1: "UNIQUE_VIOLATION", // ORA-00001
  2291: "FOREIGN_KEY_VIOLATION", // ORA-02291 parent key not found
  2292: "FOREIGN_KEY_VIOLATION", // ORA-02292 child record found
  1400: "NOT_NULL_VIOLATION", // ORA-01400
  1407: "NOT_NULL_VIOLATION", // ORA-01407
  2290: "CHECK_VIOLATION", // ORA-02290
};

// RAISE_APPLICATION_ERROR uses ORA-20000..20999. Its message arrives as
// "ORA-20001: <text>\nORA-06512: at ..." — keep only <text>.
function applicationErrorMessage(message: string): string {
  const firstLine = message.split("\n")[0];
  return firstLine.replace(/^ORA-\d+:\s*/, "").trim();
}

function toDatabaseError(err: unknown): DatabaseError {
  if (DatabaseError.is(err)) return err;
  const e = err as { message?: string; errorNum?: number; code?: string };
  const message = e?.message ?? String(err);

  if (e?.errorNum && e.errorNum >= 20000 && e.errorNum <= 20999) {
    return new DatabaseError(
      applicationErrorMessage(message),
      "APPLICATION_ERROR",
      err,
    );
  }

  const mapped = e?.errorNum ? ORA_ERROR_CODES[e.errorNum] : undefined;
  if (mapped) return new DatabaseError(message, mapped, err);

  // Thin-mode network/auth failures surface as NJS-5xx, listener and
  // credential errors as ORA-12xxx / ORA-01017.
  const isConnection =
    e?.code?.startsWith("NJS-5") ||
    e?.code?.startsWith("ORA-12") ||
    e?.errorNum === 1017;
  return new DatabaseError(
    message,
    isConnection ? "CONNECTION_FAILED" : "QUERY_FAILED",
    err,
  );
}

// PL/SQL VARCHAR2 binds top out at 32767 bytes; anything longer (e.g. the
// JSON arrays passed to p_items CLOB params) has to go over as a CLOB.
const MAX_VARCHAR_BIND_BYTES = 32767;

// Oracle < 23ai has no SQL BOOLEAN, so booleans go over as 1/0 — which 23ai
// also accepts for BOOLEAN columns.
function toOracleBind(value: BindValue): oracledb.BindParameter | BindValue {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    typeof value === "string" &&
    Buffer.byteLength(value, "utf8") > MAX_VARCHAR_BIND_BYTES
  ) {
    return { val: value, type: oracledb.DB_TYPE_CLOB };
  }
  // Same limit for binary: RAW binds cap at 32767 bytes, files go as BLOB.
  if (Buffer.isBuffer(value) && value.length > MAX_VARCHAR_BIND_BYTES) {
    return { val: value, type: oracledb.DB_TYPE_BLOB };
  }
  return value;
}

const OUT_TYPES: Record<OutBind["out"], oracledb.DbType> = {
  number: oracledb.DB_TYPE_NUMBER,
  string: oracledb.DB_TYPE_VARCHAR,
  date: oracledb.DB_TYPE_TIMESTAMP_TZ,
  cursor: oracledb.DB_TYPE_CURSOR,
};

function isOutBind(value: unknown): value is OutBind {
  return typeof value === "object" && value !== null && "out" in value;
}

function toOracleBinds(params: CallParams = {}): oracledb.BindParameters {
  const binds: Record<string, oracledb.BindParameter | BindValue> = {};
  for (const [key, value] of Object.entries(params)) {
    binds[key] = isOutBind(value)
      ? {
          dir: oracledb.BIND_OUT,
          type: OUT_TYPES[value.out],
          // VARCHAR2 OUT params need a buffer size; 32767 is the PL/SQL max.
          ...(value.out === "string" && { maxSize: MAX_VARCHAR_BIND_BYTES }),
        }
      : toOracleBind(value);
  }
  return binds;
}

// Oracle upper-cases unquoted identifiers; normalise so callers aren't
// written against Oracle's casing.
function lowerCaseKeys<T extends Row>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row))
    out[key.toLowerCase()] = value;
  return out as T;
}

async function drainCursor(
  cursor: oracledb.ResultSet<unknown>,
): Promise<Row[]> {
  const rows: Row[] = [];
  try {
    let batch: unknown[];
    do {
      batch = await cursor.getRows(500);
      for (const r of batch)
        rows.push(lowerCaseKeys(r as Record<string, unknown>));
    } while (batch.length > 0);
  } finally {
    await cursor.close();
  }
  return rows;
}

function bindConnection(
  getConnection: () => Promise<oracledb.Connection>,
  release: (conn: oracledb.Connection) => Promise<void>,
  autoCommit: boolean,
): Transaction {
  async function withConnection<T>(
    work: (conn: oracledb.Connection) => Promise<T>,
  ): Promise<T> {
    const conn = await getConnection();
    try {
      return await work(conn);
    } catch (err) {
      throw toDatabaseError(err);
    } finally {
      await release(conn);
    }
  }

  async function run<T extends Row>(
    sql: string,
    params?: BindParams,
  ): Promise<QueryResult<T>> {
    return withConnection(async (conn) => {
      const result = await conn.execute<Record<string, unknown>>(
        sql,
        toOracleBinds(params),
        { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit },
      );
      return {
        rows: (result.rows ?? []).map((r) => lowerCaseKeys<T>(r)),
        rowsAffected: result.rowsAffected ?? 0,
      };
    });
  }

  return {
    query: run,
    async queryOne<T extends Row>(
      sql: string,
      params?: BindParams,
    ): Promise<T | null> {
      const { rows } = await run<T>(sql, params);
      return rows[0] ?? null;
    },
    async execute(sql, params) {
      return (await run(sql, params)).rowsAffected;
    },
    async call<T extends CallResult>(
      sql: string,
      params?: CallParams,
    ): Promise<T> {
      return withConnection(async (conn) => {
        const result = await conn.execute<unknown>(sql, toOracleBinds(params), {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          autoCommit,
        });
        const outBinds = (result.outBinds ?? {}) as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        // Cursors must be read before the connection is released.
        for (const [key, value] of Object.entries(outBinds)) {
          const spec = params?.[key];
          out[key] =
            isOutBind(spec) && spec.out === "cursor" && value
              ? await drainCursor(value as oracledb.ResultSet<unknown>)
              : value;
        }
        return out as T;
      });
    },
  };
}

export async function createOracleClient(
  config: OracleConfig,
): Promise<DatabaseClient> {
  let pool: oracledb.Pool;
  try {
    pool = await oracledb.createPool({
      user: config.user,
      password: config.password,
      connectString: config.connectString,
      // mTLS wallet: tnsnames.ora and ewallet.pem live in the same dir.
      ...(config.walletDir && {
        configDir: config.walletDir,
        walletLocation: config.walletDir,
        walletPassword: config.walletPassword,
      }),
      poolMin: config.pool.min,
      poolMax: config.pool.max,
      poolTimeout: config.pool.idleTimeoutSeconds,
      // Runs once per new physical connection, not per checkout.
      sessionCallback: (
        conn: oracledb.Connection,
        _requestedTag: string,
        done: (err?: Error) => void,
      ) => {
        // Identifier, not a bind — validated to a plain name to rule out
        // injection through the env var.
        if (config.schema && !/^[A-Za-z][A-Za-z0-9_$#]*$/.test(config.schema)) {
          done(new Error(`Invalid DB_SCHEMA "${config.schema}"`));
          return;
        }
        // The driver gives the session this machine's time zone. Plain
        // TIMESTAMP columns hold UTC wall-clock times (SYSTIMESTAMP runs in
        // UTC here, as ORDS sessions did), and comparing one with
        // SYSTIMESTAMP reads it in the session zone — so anything else
        // shifts every expiry/window check (OTPs, reset links, coupon and
        // registration dates in the packages) by the local offset.
        conn
          .execute(
            `ALTER SESSION SET TIME_ZONE = 'UTC'${
              config.schema ? ` CURRENT_SCHEMA = ${config.schema}` : ""
            }`,
          )
          .then(() => done(), done);
      },
    });
  } catch (err) {
    throw new DatabaseError(
      `Failed to create Oracle pool: ${(err as Error).message}`,
      "CONNECTION_FAILED",
      err,
    );
  }

  // Non-transactional calls borrow a connection per statement and
  // auto-commit, so nothing is left open between requests.
  const pooled = bindConnection(
    async () => {
      try {
        return await pool.getConnection();
      } catch (err) {
        throw toDatabaseError(err);
      }
    },
    (conn) => conn.close(),
    true,
  );

  return {
    driver: "oracle",
    ...pooled,

    async transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
      let conn: oracledb.Connection;
      try {
        conn = await pool.getConnection();
      } catch (err) {
        throw toDatabaseError(err);
      }
      // Every statement in the callback shares this one connection; it's
      // only released after commit/rollback below.
      const tx = bindConnection(
        async () => conn,
        async () => {},
        false,
      );
      try {
        const result = await work(tx);
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback().catch(() => {});
        throw toDatabaseError(err);
      } finally {
        await conn.close();
      }
    },

    async ping() {
      await pooled.query("SELECT 1 FROM DUAL");
    },

    async close() {
      // Give in-flight statements up to 10s before forcing connections shut.
      await pool.close(10);
    },
  };
}
