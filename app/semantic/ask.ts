import { execute, FoodNotFoundError, UnknownMetricError, ValidationError } from "./executor";
import { getMetric } from "./registry";
import { resolveFood } from "./resolver";
import { selectMetric } from "./llm";
import type { ExecutionResult, FoodCandidate } from "./types";

/**
 * The end-to-end boundary pipeline: plain-English question -> governed answer.
 * Every outcome is an explicit, typed state. The only path to data is `execute`,
 * reached only after the LLM selected a registry metric and deterministic
 * resolution produced a single governed food_id.
 */
export type AskResponse =
  | { status: "answered"; metric: string; food_query: string; result: ExecutionResult }
  | { status: "refused"; reason: string }
  | { status: "needs_disambiguation"; metric: string; food_query: string; candidates: FoodCandidate[] }
  | { status: "food_not_found"; metric: string; food_query: string };

/** Full pipeline: ask the LLM to select a metric, then resolve + execute. */
export async function ask(
  question: string,
  opts: { apiKey?: string; model?: string } = {},
): Promise<AskResponse> {
  const selection = await selectMetric(question, opts);
  if (!selection.answerable) {
    return { status: "refused", reason: selection.reason };
  }

  const candidates = await resolveFood(selection.food_query);
  if (candidates.length === 0) {
    return { status: "food_not_found", metric: selection.metric, food_query: selection.food_query };
  }
  if (candidates.length > 1) {
    return {
      status: "needs_disambiguation",
      metric: selection.metric,
      food_query: selection.food_query,
      candidates,
    };
  }

  const result = await execute(selection.metric, { food_id: candidates[0]!.food_id });
  return { status: "answered", metric: selection.metric, food_query: selection.food_query, result };
}

/**
 * Answer for an explicitly chosen candidate (after the user disambiguates).
 * The metric is re-validated against the registry; only a governed metric +
 * resolved id reach the executor.
 */
export async function answerForFood(metric: string, foodId: number): Promise<AskResponse> {
  if (!getMetric(metric)) {
    return { status: "refused", reason: `Unknown metric: ${metric}` };
  }
  try {
    const result = await execute(metric, { food_id: foodId });
    return { status: "answered", metric, food_query: result.food.food_name, result };
  } catch (err) {
    if (err instanceof FoodNotFoundError) {
      return { status: "food_not_found", metric, food_query: String(foodId) };
    }
    if (err instanceof ValidationError || err instanceof UnknownMetricError) {
      return { status: "refused", reason: err.message };
    }
    throw err;
  }
}
