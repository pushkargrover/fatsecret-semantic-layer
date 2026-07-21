import { describe, expect, it } from "vitest";
import {
  execute,
  FoodNotFoundError,
  UnknownMetricError,
  ValidationError,
} from "../semantic/executor";

const CHICKEN_GRILLED = 1001;

describe("executor — correct governed results", () => {
  it("returns calories per 100 g for a known food", async () => {
    const r = await execute("calories_per_100g", { food_id: CHICKEN_GRILLED });
    expect(r.measures).toHaveLength(1);
    expect(r.measures[0]?.value).toBe(165);
    expect(r.measures[0]?.unit).toBe("kcal/100g");
  });

  it("returns protein density for a known food", async () => {
    const r = await execute("protein_density", { food_id: CHICKEN_GRILLED });
    expect(r.measures[0]?.value).toBeCloseTo(18.79, 1);
  });

  it("returns a three-way macro split that sums to 100%", async () => {
    const r = await execute("macro_split", { food_id: CHICKEN_GRILLED });
    expect(r.measures).toHaveLength(3);
    const sum = r.measures.reduce((acc, m) => acc + m.value, 0);
    expect(sum).toBeCloseTo(100, 5);
  });
});

describe("executor — provenance is the return value", () => {
  it("exposes the exact SQL, bound param, definition, and source row", async () => {
    const r = await execute("calories_per_100g", { food_id: CHICKEN_GRILLED });
    expect(r.compiled_sql).toContain("WHERE food_id = ?");
    expect(r.compiled_sql).not.toContain(String(CHICKEN_GRILLED));
    expect(r.bound_params).toEqual([CHICKEN_GRILLED]);
    expect(r.metric.definition).toBeTruthy();
    expect(r.metric.source_models).toContain("mart_food_metrics");
    expect(r.food.food_name).toBe("Chicken breast, grilled");
    expect(r.source_row.food_name).toBe("Chicken breast, grilled");
  });
});

describe("executor — the governance boundary rejects bad input", () => {
  it("rejects an undeclared filter", async () => {
    await expect(
      execute("calories_per_100g", { food_id: CHICKEN_GRILLED, region: "US" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a non-integer / injection-shaped food_id", async () => {
    await expect(
      execute("calories_per_100g", { food_id: "1001 OR 1=1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a missing required filter", async () => {
    await expect(execute("calories_per_100g", {})).rejects.toBeInstanceOf(ValidationError);
  });

  it("raises FoodNotFound for an id absent from the mart", async () => {
    await expect(
      execute("calories_per_100g", { food_id: 999999 }),
    ).rejects.toBeInstanceOf(FoodNotFoundError);
  });

  it("raises UnknownMetric for a metric outside the registry", async () => {
    await expect(execute("sodium_per_bite", { food_id: CHICKEN_GRILLED })).rejects.toBeInstanceOf(
      UnknownMetricError,
    );
  });
});
