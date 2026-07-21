import { NextResponse } from "next/server";
import { z } from "zod";
import { answerForFood, ask, type AskResponse } from "../../../semantic/ask";

// The executor uses a native DuckDB addon; force the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuestionReq = z.object({ question: z.string().min(1).max(500) });
const PickReq = z.object({ metric: z.string().min(1), food_id: z.number().int().positive() });
const Body = z.union([QuestionReq, PickReq]);

export function publicErrorFor(err: unknown): { error: string; status: number } {
  const message = err instanceof Error ? err.message : "";
  if (/API_KEY is not set/i.test(message)) {
    return { error: "LLM provider is not configured.", status: 503 };
  }
  if (/OpenAI|Anthropic|LLM provider/i.test(message)) {
    return { error: "LLM provider request failed.", status: 502 };
  }
  return { error: "Unexpected server error.", status: 500 };
}

export async function POST(request: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Expected { question } or { metric, food_id }." }, { status: 400 });
  }

  try {
    const response: AskResponse =
      "question" in parsed.data
        ? await ask(parsed.data.question)
        : await answerForFood(parsed.data.metric, parsed.data.food_id);
    return NextResponse.json(response);
  } catch (err) {
    const { error, status } = publicErrorFor(err);
    return NextResponse.json({ error }, { status });
  }
}
