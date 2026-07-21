# The LLM never touches the data.

A natural-language nutrition data product with a **governed semantic layer**. You ask a
question in plain English; a language model chooses *which pre-defined metric* answers it —
and nothing more. It never writes SQL, never sees raw tables, and never invents an identifier.
Deterministic code resolves the food, runs a versioned governed query, and every answer shows
its provenance: which metric, its exact definition, the SQL that ran, and the source rows.

If the question can't be answered by a defined metric, the system **refuses** rather than
guessing. Refusing to guess is the product.

**▶ Live demo: https://fatsecret-semantic-layer.vercel.app** — running on Vercel serverless over a
real slice of FatSecret data: the LLM (OpenAI) selects a metric, a native DuckDB engine queries
the frozen mart, every answer shows its provenance.

## The three metrics (deliberately just three)

| Metric | Definition |
|---|---|
| `calories_per_100g` | Food energy in kcal per 100 g |
| `macro_split` | Protein / carbs / fat as % of total food energy |
| `protein_density` | Grams of protein per 100 kcal of food energy |

Three metrics with tests, lineage, and single-owner definitions beat twenty without. The
discipline is the point.

## Architecture

```
FatSecret API → ingest → warehouse (raw)
                            → dbt (staging → marts) + tests + descriptions
                              → frozen marts (Parquet)
                                → semantic layer (metric registry: name, definition, SQL, allowed filters, owner)
                                  → LLM: plain English → metric selection ONLY (never SQL, never table access)
                                    → executor runs the pre-defined, parameter-bound query
                                      → answer + "which metric, which definition, which rows"
```

The non-negotiable rule: the LLM returns `{metric, food_query}` — a metric name and a food
*string*. It never returns SQL and never returns an id. Application code maps that to a
governed query. That boundary is the entire thesis.

## Status

**Phases 0–2 built and verified.** The governed semantic layer (registry → executor → LLM
boundary → provenance UI) runs end-to-end with 29 passing tests (unit + an integration test
against the real mart); the **dbt** project (staging → marts, 37 data tests, lineage docs, a
reconciliation test that quarantines any food whose macros don't reconcile) builds on DuckDB and
freezes the governed mart to the app's Parquet. The demo runs on ~20 foods pulled live from the
FatSecret API (recorded in `pipeline/ingest/ingest_manifest.csv`). See
[docs/PROJECT.md](docs/PROJECT.md) for the full picture.

### Run the app 

```bash
cd app
npm install
npm run codegen     # governance integrity gate (prints the LLM's metric enum)
npm test            # 29 tests (executor, resolver, registry, LLM boundary, + live-mart integration)
cp .env.example .env.local   # then set OPENAI_API_KEY (default provider; see below)
npm run dev         # http://localhost:3000
npm run eval        # live LLM constraint proof (needs an LLM key)
```

The provider is swappable; **OpenAI is the default**. 

```
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
# or: LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY=sk-ant-... + ANTHROPIC_MODEL=claude-sonnet-5
```

The frozen mart (`app/data/mart_food_metrics.parquet`) is committed, so the app runs without the
pipeline. The deterministic suite runs offline — only `npm run eval` and the live question flow
need an API key, because the key is used **solely for metric selection**, never for data access.

### Run the data pipeline (dbt on DuckDB)

```bash
cd pipeline && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
cd dbt && dbt deps --profiles-dir . && dbt build --profiles-dir . && dbt docs generate --profiles-dir .
cd .. && .venv/Scripts/python freeze/export_parquet.py   # refreeze the mart for the app
```

See [pipeline/README.md](pipeline/README.md) for live FatSecret ingest and the Snowflake target.

---

_Independent demo built on the public FatSecret Platform API. Not affiliated with or endorsed
by FatSecret. Only a small slice (~20 foods) pulled from the API is cached, in line with the
API terms; raw pulls are gitignored and never redistributed.
