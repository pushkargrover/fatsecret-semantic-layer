import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "evals/**/*.test.ts"],
    // Loads .env.local so the eval harness can see ANTHROPIC_API_KEY.
    setupFiles: ["tests/setup.ts"],
    // The eval suite calls the live LLM; keep a generous ceiling.
    testTimeout: 30_000,
  },
});
