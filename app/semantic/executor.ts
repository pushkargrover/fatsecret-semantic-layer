import { getMetric, getSqlTemplate } from "./registry";
import { query } from "./warehouse";
import type { ExecutionResult, Measure, MetricDef } from "./types";

/** The requested metric is not in the registry. Should be caught before here. */
export class UnknownMetricError extends Error {}
/** Params violate the metric's declared `allowed_filters`. */
export class ValidationError extends Error {}
/** The resolved food_id has no row in the governed mart. */
export class FoodNotFoundError extends Error {}

export interface ExecuteParams {
  food_id: number;
}

/**
 * Validate params strictly against the metric's `allowed_filters`: every required
 * filter must be present, every supplied filter must be declared, and `food_id`
 * must be a positive integer. Undeclared or mistyped input is rejected — the
 * governance boundary, enforced in code.
 */
function validateParams(metric: MetricDef, params: Record<string, unknown>): ExecuteParams {
  const declared = new Set(metric.allowed_filters.map((f) => f.name));
  for (const key of Object.keys(params)) {
    if (!declared.has(key)) {
      throw new ValidationError(`Filter "${key}" is not allowed for metric "${metric.name}".`);
    }
  }
  for (const filter of metric.allowed_filters) {
    if (filter.required && params[filter.name] === undefined) {
      throw new ValidationError(`Metric "${metric.name}" requires filter "${filter.name}".`);
    }
  }

  const rawId = params.food_id;
  const foodId = typeof rawId === "number" ? rawId : Number(rawId);
  if (!Number.isInteger(foodId) || foodId <= 0) {
    throw new ValidationError(`food_id must be a positive integer, got: ${String(rawId)}`);
  }
  return { food_id: foodId };
}

/**
 * Run a governed metric query for a resolved food. This is the only path from a
 * metric selection to data, and it never sees free-form SQL: the query text comes
 * from the registry and the single parameter is bound by the driver.
 */
export async function execute(
  metricName: string,
  params: Record<string, unknown>,
): Promise<ExecutionResult> {
  const metric = getMetric(metricName);
  if (!metric) throw new UnknownMetricError(`No such metric: ${metricName}`);

  const { food_id } = validateParams(metric, params);
  const sql = getSqlTemplate(metric);

  const rows = await query(sql, [food_id]);
  if (rows.length === 0) {
    throw new FoodNotFoundError(`No food with food_id=${food_id} in the governed mart.`);
  }
  const row = rows[0]!;

  const measures: Measure[] = metric.measures.map((m) => {
    const value = row[m.column];
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(`Governed query for "${metric.name}" did not return numeric "${m.column}".`);
    }
    return { name: m.column, label: m.label, value, unit: m.unit };
  });

  // Full mart row as provenance ("the source rows"), distinct from the measures query.
  const sourceRows = await query(`SELECT * FROM mart_food_metrics WHERE food_id = ?`, [food_id]);

  return {
    metric: {
      name: metric.name,
      label: metric.label,
      plain_english: metric.plain_english,
      definition: metric.definition,
      owner: metric.owner,
      version: metric.version,
      source_models: metric.source_models,
    },
    food: {
      food_id,
      food_name: row.food_name as string,
      serving_note: (row.serving_note as string) ?? "",
    },
    measures,
    compiled_sql: sql,
    bound_params: [food_id],
    source_row: sourceRows[0] ?? {},
  };
}
