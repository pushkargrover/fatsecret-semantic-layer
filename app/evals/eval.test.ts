import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { selectMetric } from "../semantic/llm";

/**
 * The constraint proof. For each question, the configured LLM provider must either
 * select the expected governed metric, or refuse. This is the evidence that the
 * LLM is held to the registry, including plausible-but-undefined questions
 * (sodium, glycemic index, "healthier") being refused rather than forced onto a
 * wrong metric.
 *
 * Requires either OPENAI_API_KEY or ANTHROPIC_API_KEY; skipped otherwise so the
 * deterministic suite stays runnable offline.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const cases = readFileSync(resolve(HERE, "questions.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as { question: string; expected: string });

const provider = process.env.LLM_PROVIDER ?? (process.env.OPENAI_API_KEY ? "openai" : "anthropic");
const hasKey =
  provider === "openai" ? Boolean(process.env.OPENAI_API_KEY) : Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!hasKey)(`${provider} metric selection is constrained to the registry`, () => {
  for (const { question, expected } of cases) {
    it(`${expected === "REFUSAL" ? "refuses" : `selects ${expected}`}: "${question}"`, async () => {
      const sel = await selectMetric(question);
      if (expected === "REFUSAL") {
        expect(sel.answerable).toBe(false);
      } else {
        expect(sel.answerable).toBe(true);
        if (sel.answerable) expect(sel.metric).toBe(expected);
      }
    });
  }
});

it.runIf(!hasKey)(`eval suite skipped (no API key for ${provider})`, () => {
  expect(cases.length).toBeGreaterThan(0);
});
