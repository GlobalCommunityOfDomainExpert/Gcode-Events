# Database infrastructure

A thin, vendor-neutral data-access layer. App code talks to the
`DatabaseClient` interface; the concrete database is chosen at runtime by
`DB_DRIVER`. Today the only driver is Oracle (node-oracledb **Thin mode** — no
Instant Client required).

```
src/infrastructure/database/
├── index.ts          # public entry: getDatabase(), closeDatabase(), types
├── types.ts          # DatabaseClient / Transaction / config contracts
├── errors.ts         # DatabaseError with vendor-neutral codes
├── config.ts         # reads env → DatabaseConfig
└── drivers/
    └── oracle.ts     # node-oracledb (Thin) implementation
```

## Usage (server only — route handlers, server components, server actions)

```ts
import { getDatabase, DatabaseError } from "@/infrastructure/database";

const db = await getDatabase();

const events = await db.query<{ id: number; title: string }>(
  "SELECT id, title FROM events WHERE status = :status",
  { status: "PUBLISHED" },
);

await db.transaction(async (tx) => {
  await tx.execute("INSERT INTO a (x) VALUES (:x)", { x: 1 });
  await tx.execute("UPDATE b SET y = :y", { y: 2 });
}); // commits on resolve, rolls back on throw

try {
  await db.execute("INSERT INTO users (email) VALUES (:email)", { email });
} catch (err) {
  if (DatabaseError.is(err) && err.code === "UNIQUE_VIOLATION") {
    /* already registered */
  }
}
```

Conventions every driver honours:

- Named binds (`:name`) in SQL.
- Result column names are **lower-cased**.
- LOBs come back as `string` / `Buffer`; booleans bind as `1`/`0` on Oracle.
- Errors are `DatabaseError` with a `code` — don't inspect driver-specific
  errors in app code.

Only ever import from `@/infrastructure/database`, never from `./drivers/*`.

## Configuration

| Variable               | Required | Notes                                                        |
| ---------------------- | -------- | ------------------------------------------------------------ |
| `DB_DRIVER`            | no       | `oracle` (default)                                           |
| `DB_USER`              | yes      | Schema user                                                  |
| `DB_PASSWORD`          | yes      |                                                              |
| `DB_CONNECT_STRING`    | yes      | EZConnect, TNS alias, or full descriptor                     |
| `DB_WALLET_DIR`        | mTLS     | Unzipped wallet dir (contains `tnsnames.ora`, `ewallet.pem`) |
| `DB_WALLET_PASSWORD`   | mTLS     | Password chosen when downloading the wallet                  |
| `DB_POOL_MIN`          | no       | default `0`                                                  |
| `DB_POOL_MAX`          | no       | default `4`                                                  |
| `DB_POOL_IDLE_TIMEOUT` | no       | seconds, default `60`                                        |

### Autonomous Database

- **TLS (walletless)** — enable it in the ADB console (_Network → Mutual TLS
  authentication: Not required_ + an ACL), then copy a TLS connection string
  from _Database connection_ into `DB_CONNECT_STRING`. No wallet vars needed.
- **mTLS (wallet)** — download the wallet, unzip it somewhere outside the
  repo, set `DB_WALLET_DIR`/`DB_WALLET_PASSWORD`, and use a TNS alias such as
  `gcdev01_high` as `DB_CONNECT_STRING`.

## Adding another database

1. Add the driver name to `DatabaseDriver` and its config shape to the
   `DatabaseConfig` union in `types.ts`.
2. Read its env vars in `config.ts` (and add it to `SUPPORTED_DRIVERS`).
3. Create `drivers/<name>.ts` exporting `create<Name>Client(config)` that
   returns a `DatabaseClient` — translate `:name` binds if the vendor uses
   positional placeholders, lower-case column names, and map native errors
   to `DatabaseError` codes.
4. Add a `case` to `createClient()` in `index.ts`.
5. If the package uses native/Node-only features, add it to
   `serverExternalPackages` in `next.config.ts`.

Nothing outside this folder changes — as long as callers stick to portable
SQL. Vendor-specific SQL (e.g. `FETCH FIRST`, `DUAL`, sequences) is the part a
switch can't make free; keep it in repository/query modules rather than
scattered through routes so there's one place to port.
