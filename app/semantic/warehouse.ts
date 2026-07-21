import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

/**
 * Read-only access to the frozen mart. A single in-process DuckDB connection
 * exposes `mart_food_metrics` as a view over the committed Parquet file. All
 * queries run through {@link query}, which binds parameters (never string
 * interpolation) and coerces DuckDB's BigInt/Decimal values to plain JS numbers.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
// Default to the frozen demo mart; tests point MART_PARQUET_PATH at a fixed fixture
// so unit assertions never depend on whatever was last ingested.
const MART_PARQUET = (
  process.env.MART_PARQUET_PATH ?? resolve(HERE, "..", "data", "mart_food_metrics.parquet")
).replaceAll("\\", "/");

// Reuse the connection across hot-reloads / requests in dev to avoid leaking instances.
const globalRef = globalThis as unknown as { __fsConn?: Promise<DuckDBConnection> };

async function connect(): Promise<DuckDBConnection> {
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  await conn.run(
    `CREATE VIEW mart_food_metrics AS SELECT * FROM read_parquet('${MART_PARQUET}')`,
  );
  return conn;
}

function getConnection(): Promise<DuckDBConnection> {
  if (!globalRef.__fsConn) globalRef.__fsConn = connect();
  return globalRef.__fsConn;
}

/** Convert DuckDB scalar representations into plain JS values. */
export function coerce(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (
    value !== null &&
    typeof value === "object" &&
    "scale" in value &&
    "value" in value
  ) {
    // DuckDBDecimal-like { width, scale, value: bigint }
    const d = value as { scale: number | bigint; value: number | bigint };
    return Number(d.value) / 10 ** Number(d.scale);
  }
  return value;
}

/** Run a parameter-bound query and return coerced row objects. */
export async function query(
  sql: string,
  params: Array<string | number> = [],
): Promise<Array<Record<string, unknown>>> {
  const conn = await getConnection();
  const reader = await conn.runAndReadAll(sql, params);
  return reader.getRowObjects().map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) out[k] = coerce(v);
    return out;
  });
}
