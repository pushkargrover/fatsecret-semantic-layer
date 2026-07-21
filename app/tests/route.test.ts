import { describe, expect, it } from "vitest";
import { publicErrorFor } from "../app/api/ask/route";

describe("api error mapping", () => {
  it("does not expose missing provider key details", () => {
    expect(publicErrorFor(new Error("OPENAI_API_KEY is not set."))).toEqual({
      error: "LLM provider is not configured.",
      status: 503,
    });
  });

  it("does not expose unexpected internal errors", () => {
    expect(publicErrorFor(new Error("database path C:/secret/local/file failed"))).toEqual({
      error: "Unexpected server error.",
      status: 500,
    });
  });
});
