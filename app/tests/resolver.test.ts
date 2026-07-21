import { describe, expect, it } from "vitest";
import { resolveFood, scoreMatch } from "../semantic/resolver";

describe("scoreMatch", () => {
  it("scores an exact (normalized) match as 1", () => {
    expect(scoreMatch("olive oil", "Olive oil")).toBe(1);
  });

  it("scores a full-coverage partial match highly", () => {
    expect(scoreMatch("chicken breast", "Chicken breast, grilled")).toBeGreaterThanOrEqual(0.99);
  });

  it("scores an unrelated food at zero", () => {
    expect(scoreMatch("unicorn meat", "Olive oil")).toBe(0);
  });
});

describe("resolveFood", () => {
  it("returns both variants for an ambiguous query (drives disambiguation)", async () => {
    const candidates = await resolveFood("chicken breast");
    const names = candidates.map((c) => c.food_name);
    expect(names).toContain("Chicken breast, grilled");
    expect(names).toContain("Chicken breast, raw");
  });

  it("ranks the more specific match first", async () => {
    const candidates = await resolveFood("grilled chicken");
    expect(candidates[0]?.food_name).toBe("Chicken breast, grilled");
  });

  it("resolves an unambiguous query to a single candidate", async () => {
    const candidates = await resolveFood("almonds");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.food_id).toBe(1003);
  });

  it("returns no candidates for a food not in the governed set", async () => {
    expect(await resolveFood("unicorn meat")).toHaveLength(0);
  });
});
