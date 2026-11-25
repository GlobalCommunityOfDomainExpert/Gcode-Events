import { DatabaseError } from "./errors";
import type { DatabaseConfig, DatabaseDriver, PoolConfig } from "./types";

const SUPPORTED_DRIVERS: readonly DatabaseDriver[] = ["oracle"];

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new DatabaseError(
      `Missing required env var: ${name}`,
      "CONFIG_INVALID",
    );
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 0) {
    throw new DatabaseError(
      `${name} must be a non-negative integer, got "${raw}"`,
      "CONFIG_INVALID",
    );
  }
  return value;
}

function poolConfig(): PoolConfig {
  return {
    min: intEnv("DB_POOL_MIN", 0),
    max: intEnv("DB_POOL_MAX", 4),
    idleTimeoutSeconds: intEnv("DB_POOL_IDLE_TIMEOUT", 60),
  };
}

// DB_DRIVER picks the implementation; each driver reads its own
// connection settings. Defaults to oracle since that's what we run on.
export function loadDatabaseConfig(): DatabaseConfig {
  const driver = (process.env.DB_DRIVER ?? "oracle") as DatabaseDriver;
  if (!SUPPORTED_DRIVERS.includes(driver)) {
    throw new DatabaseError(
      `Unsupported DB_DRIVER "${driver}". Expected one of: ${SUPPORTED_DRIVERS.join(", ")}`,
      "CONFIG_INVALID",
    );
  }

  switch (driver) {
    case "oracle":
      return {
        driver,
        user: requiredEnv("DB_USER"),
        password: requiredEnv("DB_PASSWORD"),
        connectString: requiredEnv("DB_CONNECT_STRING"),
        walletDir: process.env.DB_WALLET_DIR || undefined,
        walletContent: process.env.DB_WALLET_PEM_BASE64
          ? Buffer.from(process.env.DB_WALLET_PEM_BASE64, "base64").toString(
              "utf8",
            )
          : undefined,
        walletPassword: process.env.DB_WALLET_PASSWORD || undefined,
        schema: process.env.DB_SCHEMA || undefined,
        pool: poolConfig(),
      };
  }
}
