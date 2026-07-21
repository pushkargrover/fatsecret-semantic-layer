import { describe, expect, it } from "vitest";
import { getRegistry, getSqlTemplate, metricNames, registryForLLM } from "../semantic/registry";

describe("registry", () => {
  it("loads exactly the three governed metrics", () => {
    expect(metricNames().sort()).toEqual(["calories_per_100g", "macro_split", "protein_density"]);
  });

  it("exposes only name + plain_english to the LLM (no SQL, no columns)", () => {
    for (const entry of registryForLLM()) {
      expect(Object.keys(entry).sort()).toEqual(["name", "plain_english"]);
    }
  });

  it("every governed query is parameter-bound by food_id against the mart", () => {
    for (const metric of getRegistry()) {
      const sql = getSqlTemplate(metric);
      expect(sql).toContain("mart_food_metrics");
      expect(sql).toContain("WHERE food_id = ?");
      // Exactly one bind parameter — no room for a second, unvalidated filter.
      expect(sql.split("?").length - 1).toBe(1);
    }
  });

  it("declares an owner and version for every metric (single definition, single owner)", () => {
    for (const metric of getRegistry()) {
      expect(metric.owner).toBeTruthy();
      expect(metric.version).toBeGreaterThan(0);
    }
  });
});
