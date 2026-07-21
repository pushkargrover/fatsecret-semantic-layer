import { query } from "./warehouse";
import type { FoodCandidate } from "./types";

/**
 * Deterministic entity resolution: a natural-language food string -> governed
 * `food_id`s. The LLM never does this and never emits an id. Matching is pure
 * token-coverage scoring so it is fully explainable and unit-testable.
 */

const MATCH_THRESHOLD = 0.5;
const MAX_CANDIDATES = 5;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  const n = normalize(s);
  return n.length === 0 ? [] : n.split(" ");
}

/**
 * Score a food name against a query in [0,1]. Coverage of the query's tokens by
 * the food's tokens, with an exact-match short-circuit and a substring bonus so
 * more specific matches ("grilled chicken") outrank generic ones.
 */
export function scoreMatch(queryStr: string, foodName: string): number {
  const q = normalize(queryStr);
  const f = normalize(foodName);
  if (q.length === 0) return 0;
  if (q === f) return 1;

  const qTokens = tokens(queryStr);
  const fTokens = new Set(tokens(foodName));
  const matched = qTokens.filter((t) => fTokens.has(t)).length;
  let score = matched / qTokens.length;

  // Small bonus when one string contains the other, capped below an exact match.
  if (f.includes(q) || q.includes(f)) score = Math.min(0.99, score + 0.15);
  return score;
}

/** Resolve a food string to ranked candidates above the match threshold. */
export async function resolveFood(queryStr: string): Promise<FoodCandidate[]> {
  const rows = await query(
    `SELECT DISTINCT food_id, food_name, serving_note FROM mart_food_metrics`,
  );

  return rows
    .map((r) => ({
      food_id: r.food_id as number,
      food_name: r.food_name as string,
      serving_note: (r.serving_note as string) ?? "",
      score: scoreMatch(queryStr, r.food_name as string),
    }))
    .filter((c) => c.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.food_name.localeCompare(b.food_name))
    .slice(0, MAX_CANDIDATES);
}
