import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

/**
 * Integration test against the ACTUAL frozen demo mart (app/data/*.parquet) — the
 * artifact shipped to production — not the deterministic unit fixture. It asserts
 * the governance invariants hold on whatever was last ingested, so a bad pull or a
 * broken freeze is caught before deploy.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MART = resolve(HERE, "..", "..", "data", "mart_food_metrics.parquet").replaceAll("\\", "/");
const num = (v: unknown) => (typeof v === "bigint" ? Number(v) : (v as number));

describe("integration: live demo mart (app/data/mart_food_metrics.parquet)", () => {
  let conn: DuckDBConnection;

  beforeAll(async () => {
    conn = await (await DuckDBInstance.create(":memory:")).connect();
    await conn.run(`CREATE VIEW mart AS SELECT * FROM read_parquet('${MART}')`);
  });

  async function one(sql: string): Promise<Record<string, unknown>> {
    return (await conn.runAndReadAll(sql)).getRowObjects()[0]!;
  }

  it("contains a governed slice of foods", async () => {
    const { n } = await one(`SELECT count(*) AS n FROM mart`);
    expect(num(n)).toBeGreaterThanOrEqual(18);
  });

  it("has unique, positive food_ids", async () => {
    const r = await one(
      `SELECT count(*) AS total, count(DISTINCT food_id) AS distinct_ids,
              count(*) FILTER (WHERE food_id <= 0) AS nonpos
       FROM mart`,
    );
    expect(num(r.distinct_ids)).toBe(num(r.total));
    expect(num(r.nonpos)).toBe(0);
  });

  it("every food has valid calories and protein density", async () => {
    const { bad } = await one(
      `SELECT count(*) AS bad FROM mart
       WHERE calories_per_100g IS NULL OR calories_per_100g <= 0
          OR protein_g_per_100kcal IS NULL OR protein_g_per_100kcal < 0`,
    );
    expect(num(bad)).toBe(0);
  });

  it("every macro split sums to 100%", async () => {
    const { bad } = await one(
      `SELECT count(*) AS bad FROM mart
       WHERE abs(protein_pct_energy + carb_pct_energy + fat_pct_energy - 100) > 0.001`,
    );
    expect(num(bad)).toBe(0);
  });

  it("only contains foods whose energy reconciles (governance invariant)", async () => {
    const { bad } = await one(`SELECT count(*) AS bad FROM mart WHERE NOT energy_reconciles`);
    expect(num(bad)).toBe(0);
  });
});
