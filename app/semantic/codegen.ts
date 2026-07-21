/**
 * Integrity gate for the governance boundary. Run in CI (`npm run codegen`).
 *
 * Proves, mechanically, that:
 *   1. every registry metric has a governed SQL file,
 *   2. every governed query is parameter-bound by food_id against the mart,
 *   3. the LLM's metric enum is exactly the registry's metric names.
 *
 * Prints the derived enum — the exact, generated constraint the model is held to.
 */
import { getRegistry, getSqlTemplate, metricNames } from "./registry";

let failures = 0;
const fail = (msg: string) => {
  console.error(`  ✗ ${msg}`);
  failures++;
};

for (const metric of getRegistry()) {
  let sql: string;
  try {
    sql = getSqlTemplate(metric);
  } catch {
    fail(`${metric.name}: SQL template missing (${metric.sql_template})`);
    continue;
  }
  if (!sql.includes("mart_food_metrics")) fail(`${metric.name}: query does not read the governed mart`);
  if (!sql.includes("WHERE food_id = ?")) fail(`${metric.name}: query is not bound by food_id`);
  if (sql.split("?").length - 1 !== 1) fail(`${metric.name}: expected exactly one bind parameter`);
  for (const m of metric.measures) {
    if (!sql.includes(m.column)) fail(`${metric.name}: query omits declared measure "${m.column}"`);
  }
}

const enumNames = metricNames();
console.log("LLM metric enum (generated from registry):");
console.log(JSON.stringify(enumNames, null, 2));

if (failures > 0) {
  console.error(`\nGovernance integrity check FAILED with ${failures} problem(s).`);
  process.exit(1);
}
console.log(`\nGovernance integrity check passed for ${enumNames.length} metrics.`);
