import { z } from "zod";

/**
 * Schemas for the metric registry (the governance contract) and the executor's
 * result shape. The registry YAML is validated against these at load time, so a
 * malformed or under-specified governance file fails loudly rather than silently
 * degrading the guarantees the demo is built to prove.
 */

export const FilterDef = z.object({
  name: z.string(),
  // Phase 0 supports a single filter type: an identity resolved from a dimension.
  type: z.literal("id"),
  required: z.boolean(),
  resolves_via: z.string(),
});
export type FilterDef = z.infer<typeof FilterDef>;

export const MeasureDef = z.object({
  /** Column emitted by the governed query that carries this measure's value. */
  column: z.string(),
  label: z.string(),
  unit: z.string(),
});
export type MeasureDef = z.infer<typeof MeasureDef>;

export const MetricDef = z.object({
  name: z.string(),
  label: z.string(),
  plain_english: z.string(),
  definition: z.string(),
  entity: z.literal("food"),
  sql_template: z.string(),
  allowed_filters: z.array(FilterDef).min(1),
  measures: z.array(MeasureDef).min(1),
  dimensions: z.array(z.string()),
  source_models: z.array(z.string()).min(1),
  owner: z.string(),
  version: z.number().int().positive(),
});
export type MetricDef = z.infer<typeof MetricDef>;

export const Registry = z.array(MetricDef).min(1);
export type Registry = z.infer<typeof Registry>;

/** A resolved measure value, ready for display. */
export interface Measure {
  name: string; // column name
  label: string;
  value: number;
  unit: string;
}

/** A candidate food from deterministic resolution. */
export interface FoodCandidate {
  food_id: number;
  food_name: string;
  serving_note: string;
  score: number; // 0..1, higher is a better match
}

/**
 * The executor's return type. Provenance is not an add-on — it *is* the result:
 * which metric, its definition, the SQL that ran, and the source row.
 */
export interface ExecutionResult {
  metric: {
    name: string;
    label: string;
    plain_english: string;
    definition: string;
    owner: string;
    version: number;
    source_models: string[];
  };
  food: { food_id: number; food_name: string; serving_note: string };
  measures: Measure[];
  compiled_sql: string; // exact governed SQL template that ran, with placeholders intact
  bound_params: Array<string | number>;
  source_row: Record<string, unknown>; // the governed mart row = "the source rows"
}
