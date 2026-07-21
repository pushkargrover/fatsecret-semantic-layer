"use client";

import { useState } from "react";
import type { AskResponse } from "../semantic/ask";
import type { ExecutionResult, FoodCandidate } from "../semantic/types";

const EXAMPLES: Array<{ q: string; unanswerable?: boolean }> = [
  { q: "How many calories are in 100g of almonds?" },
  { q: "What's the macro split of a boiled egg?" },
  { q: "How protein-dense is chicken breast?" },
  { q: "Is olive oil keto-friendly?", unanswerable: true },
];

export default function Page() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AskResponse | null>(null);

  async function send(body: object) {
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed.");
      setResponse(data as AskResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function askQuestion(q: string) {
    setQuestion(q);
    void send({ question: q });
  }

  return (
    <div className="wrap">
      <header>
        <h1>The LLM never touches the data.</h1>
        <p className="thesis">
          Ask in plain English. A language model picks <em>which governed metric</em> answers you —
          nothing more. Deterministic code resolves the food and runs a pre-defined query. Every
          answer shows its provenance. If no metric fits, it refuses.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim()) void send({ question: question.trim() });
        }}
      >
        <input
          type="text"
          value={question}
          placeholder="e.g. How protein-dense is greek yogurt?"
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={loading || !question.trim()}>
          {loading ? "Asking…" : "Ask"}
        </button>
      </form>

      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.q}
            className={`chip${ex.unanswerable ? " unanswerable" : ""}`}
            onClick={() => askQuestion(ex.q)}
          >
            {ex.q}
          </button>
        ))}
      </div>

      {error && (
        <div className="card refused">
          <strong>Error:</strong> {error}
        </div>
      )}

      {response && <ResponseView response={response} onPick={(metric, food_id) => send({ metric, food_id })} />}
    </div>
  );
}

function ResponseView({
  response,
  onPick,
}: {
  response: AskResponse;
  onPick: (metric: string, foodId: number) => void;
}) {
  switch (response.status) {
    case "answered":
      return <AnswerCard result={response.result} />;
    case "refused":
      return (
        <div className="card refused">
          <div className="answer-head">No governed metric fits this question.</div>
          <p style={{ margin: "4px 0 8px" }}>{response.reason}</p>
          <p className="muted">This is the point. It doesn&apos;t guess.</p>
        </div>
      );
    case "food_not_found":
      return (
        <div className="card">
          <div className="answer-head">Metric selected: <span className="pill">{response.metric}</span></div>
          <p>
            No food matching “{response.food_query}” is in the governed dataset (a small curated
            sample). Try one of the example foods.
          </p>
        </div>
      );
    case "needs_disambiguation":
      return (
        <div className="card">
          <div className="answer-head">
            Metric selected: <span className="pill">{response.metric}</span> — which “{response.food_query}”?
          </div>
          {response.candidates.map((c: FoodCandidate) => (
            <button key={c.food_id} className="candidate" onClick={() => onPick(response.metric, c.food_id)}>
              {c.food_name} <span>({c.serving_note})</span>
            </button>
          ))}
        </div>
      );
  }
}

function AnswerCard({ result }: { result: ExecutionResult }) {
  const isSplit = result.measures.length > 1;
  return (
    <div className="card">
      <div className="answer-head">
        {result.food.food_name} · {result.food.serving_note} · <span className="pill">{result.metric.name}</span>
      </div>

      {isSplit ? (
        result.measures.map((m) => (
          <div className="bar-row" key={m.name}>
            <span className="label">{m.label}</span>
            <span className="bar-track">
              <span className="bar" style={{ width: `${Math.max(0, Math.min(100, m.value))}%` }} />
            </span>
            <span>{m.value.toFixed(1)}%</span>
          </div>
        ))
      ) : (
        <div className="measure">
          <span className="val">{result.measures[0]!.value.toFixed(1)}</span>
          <span className="unit">{result.measures[0]!.unit}</span>
        </div>
      )}

      <TrustPanel result={result} />
    </div>
  );
}

function TrustPanel({ result }: { result: ExecutionResult }) {
  return (
    <div className="trust">
      <h3>Why you can trust this</h3>
      <dl>
        <dt>Metric</dt>
        <dd>{result.metric.label} (v{result.metric.version}, owner: {result.metric.owner})</dd>
        <dt>Definition</dt>
        <dd>{result.metric.definition}</dd>
        <dt>Lineage</dt>
        <dd>{result.metric.source_models.join(" → ")}</dd>
      </dl>

      <div className="answer-head">The SQL that ran (parameters bound, not interpolated):</div>
      <pre>{result.compiled_sql}</pre>
      <div className="answer-head">Bound parameters</div>
      <pre>{JSON.stringify(result.bound_params, null, 2)}</pre>

      <div className="answer-head">Source row</div>
      <table>
        <tbody>
          {Object.entries(result.source_row).map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{formatCell(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}
