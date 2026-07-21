import Anthropic from "@anthropic-ai/sdk";
import { getMetric, metricNames, registryForLLM } from "./registry";

/**
 * The LLM boundary. The provider is deliberately swappable: OpenAI or Anthropic
 * may route the question, but either way the model only sees metric names plus
 * plain-English descriptions and returns a metric name plus a food string.
 *
 * It never sees SQL or raw tables, never emits SQL, and never emits a food id.
 */

export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

export type LLMProvider = "openai" | "anthropic";

export type Selection =
  | { answerable: true; metric: string; food_query: string }
  | { answerable: false; reason: string };

const TOOL_NAME = "answer_nutrition_question";

interface SelectionJsonSchema {
  type: "object";
  additionalProperties: false;
  properties: Record<string, unknown>;
  required: string[];
  [k: string]: unknown;
}

function configuredProvider(provider?: string): LLMProvider {
  const requested = (provider ?? process.env.LLM_PROVIDER ?? "").toLowerCase();
  if (requested === "openai" || requested === "anthropic") return requested;
  if (process.env.OPENAI_API_KEY) return "openai";
  return "anthropic";
}

function selectionSchema(): SelectionJsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      answerable: {
        type: "boolean",
        description:
          "True only if one of the listed metrics answers the question. Otherwise false.",
      },
      metric: {
        type: "string",
        enum: [...metricNames(), ""],
        description:
          "The governed metric that answers the question, or an empty string if unanswerable.",
      },
      food_query: {
        type: "string",
        description:
          "The food in plain words, never an id or SQL. Empty string if unanswerable.",
      },
      reason_if_unanswerable: {
        type: "string",
        description:
          "If answerable is false, a short reason no listed metric fits. Empty string if answerable.",
      },
    },
    required: ["answerable", "metric", "food_query", "reason_if_unanswerable"],
  };
}

function buildAnthropicTool(): Anthropic.Tool {
  return {
    name: TOOL_NAME,
    description:
      "Record how to answer the user's nutrition question using exactly one governed metric.",
    input_schema: selectionSchema(),
  };
}

function systemPrompt(): string {
  const catalogue = registryForLLM()
    .map((m) => `- ${m.name}: ${m.plain_english}`)
    .join("\n");
  return [
    "You route a user's plain-English nutrition question to exactly one governed metric.",
    "",
    "You may ONLY use these metrics:",
    catalogue,
    "",
    "Rules:",
    "- If one metric answers the question, set answerable=true and give that metric plus the food as a plain string.",
    "- If NO listed metric fits the question, set answerable=false and explain briefly. Do not guess or approximate with a different metric.",
    "- Refuse diet suitability, diet-label, health, comparison, recommendation, or advice questions (for example: keto-friendly, healthy, healthier, best, should I eat).",
    "- Do not use macro_split to answer whether a food fits a diet; macro_split only answers the descriptive percentage split of protein/carbohydrate/fat energy.",
    "- Never invent data, never output SQL, never output an id. You select a metric and name the food; nothing else.",
    "- For unanswerable questions, use empty strings for metric and food_query.",
  ].join("\n");
}

/** Parse + validate a structured model response into a trusted Selection. Invalid -> refusal. */
export function validateToolInput(input: Record<string, unknown>): Selection {
  if (input.answerable !== true) {
    const reason =
      typeof input.reason_if_unanswerable === "string" && input.reason_if_unanswerable.trim()
        ? input.reason_if_unanswerable.trim()
        : "No defined metric answers this question.";
    return { answerable: false, reason };
  }
  const metric = typeof input.metric === "string" ? input.metric : "";
  const foodQuery = typeof input.food_query === "string" ? input.food_query.trim() : "";
  // Defence in depth: even though schemas constrain the model, re-check the registry.
  if (!getMetric(metric) || foodQuery.length === 0) {
    return { answerable: false, reason: "No defined metric answers this question." };
  }
  return { answerable: true, metric, food_query: foodQuery };
}

interface SelectMetricOpts {
  apiKey?: string;
  model?: string;
  provider?: LLMProvider;
}

interface OpenAIResponseBody {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

function extractOpenAIText(body: OpenAIResponseBody): string | undefined {
  if (typeof body.output_text === "string") return body.output_text;
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  return undefined;
}

async function selectMetricOpenAI(
  question: string,
  opts: SelectMetricOpts = {},
): Promise<Selection> {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const model = opts.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: question },
      ],
      max_output_tokens: 300,
      text: {
        format: {
          type: "json_schema",
          name: "nutrition_metric_selection",
          strict: true,
          schema: selectionSchema(),
        },
      },
    }),
  });

  const body = (await response.json().catch(() => ({}))) as OpenAIResponseBody;
  if (!response.ok) {
    const detail = body.error?.message ?? `OpenAI request failed with status ${response.status}.`;
    throw new Error(detail);
  }

  const text = extractOpenAIText(body);
  if (!text) {
    return { answerable: false, reason: "No defined metric answers this question." };
  }

  try {
    return validateToolInput(JSON.parse(text) as Record<string, unknown>);
  } catch {
    return { answerable: false, reason: "No defined metric answers this question." };
  }
}

async function selectMetricAnthropic(
  question: string,
  opts: SelectMetricOpts = {},
): Promise<Selection> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
    max_tokens: 512,
    system: systemPrompt(),
    tools: [buildAnthropicTool()],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: question }],
  });

  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME,
  );
  if (!toolUse) {
    return { answerable: false, reason: "No defined metric answers this question." };
  }
  return validateToolInput(toolUse.input as Record<string, unknown>);
}

/** Ask the configured provider to select a governed metric for the question. */
export async function selectMetric(
  question: string,
  opts: SelectMetricOpts = {},
): Promise<Selection> {
  const provider = configuredProvider(opts.provider);
  if (provider === "openai") return selectMetricOpenAI(question, opts);
  return selectMetricAnthropic(question, opts);
}
