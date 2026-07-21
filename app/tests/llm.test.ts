import { describe, expect, it } from "vitest";
import { validateToolInput } from "../semantic/llm";

/**
 * The LLM boundary's validation is pure and deterministic — it needs no network.
 * These tests prove the "defence in depth" re-check: even if a tool call arrives
 * with a metric outside the registry, it is downgraded to a refusal.
 */
describe("validateToolInput", () => {
  it("accepts a valid, registry-backed selection", () => {
    const sel = validateToolInput({
      answerable: true,
      metric: "protein_density",
      food_query: "chicken breast",
    });
    expect(sel).toEqual({ answerable: true, metric: "protein_density", food_query: "chicken breast" });
  });

  it("treats answerable=false as a refusal with a reason", () => {
    const sel = validateToolInput({ answerable: false, reason_if_unanswerable: "no metric fits" });
    expect(sel.answerable).toBe(false);
    if (!sel.answerable) expect(sel.reason).toBe("no metric fits");
  });

  it("refuses a metric outside the registry even if answerable=true", () => {
    const sel = validateToolInput({ answerable: true, metric: "sodium_per_bite", food_query: "chips" });
    expect(sel.answerable).toBe(false);
  });

  it("refuses when the food query is empty", () => {
    const sel = validateToolInput({ answerable: true, metric: "calories_per_100g", food_query: "  " });
    expect(sel.answerable).toBe(false);
  });
});
