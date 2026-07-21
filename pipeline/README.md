# Data pipeline — FatSecret → warehouse → dbt → frozen mart

This is the part that proves the data engineering. It ingests a small curated slice of
FatSecret foods, models it with **dbt** (staging → marts, tested and documented), and freezes
the governed mart to Parquet for the app. One dbt codebase runs on **DuckDB** (default, free,
CI) and **Snowflake** (same models, resume-grade warehouse).

```
FatSecret API → ingest/land_raw.py → seeds/raw_food_nutrition.csv (raw)
                                        → dbt: staging → marts (+ tests + docs + lineage)
                                          → freeze/export_parquet.py → app/data/*.parquet
```

## Setup

Requires **Python 3.12**. The `.venv/` is machine-specific and gitignored, so create it locally:

```bash
cd pipeline
python -m venv .venv                                # or: py -3.12 -m venv .venv
.venv/Scripts/pip install -r requirements.txt       # (Windows; use bin/ on macOS/Linux)
.venv/Scripts/python --version                      # sanity check -> Python 3.12.x
```

If `python`/`py` aren't on your PATH, call the interpreter by full path — on the dev machine it is
`C:\Users\<you>\AppData\Local\Programs\Python\Python312\python.exe` (adjust `<you>`). Everything
below uses the venv's own interpreter (`.venv/Scripts/python`), so PATH only matters for creating
the venv.

## Run the models (DuckDB — no credentials needed)

The committed `seeds/raw_food_nutrition.csv` is a small API-pulled slice, so the whole pipeline
runs offline:

```bash
cd dbt
dbt deps  --profiles-dir .
dbt build --profiles-dir .        # seed + run + test
dbt docs generate --profiles-dir .   # lineage graph + column docs
dbt docs serve   --profiles-dir .    # view it
```

Then freeze the mart for the app:

```bash
cd ..
.venv/Scripts/python -m freeze.export_parquet
```

## Ingest live FatSecret data (Phase 1, needs credentials)

1. Get a Client ID / Secret at https://platform.fatsecret.com (Manage → Apps); allowlist your IP.
2. `cp .env.example .env` and fill in `FATSECRET_CLIENT_ID` / `FATSECRET_CLIENT_SECRET`.
3. `.venv/Scripts/python -m ingest.land_raw` - regenerates `seeds/raw_food_nutrition.csv`
   from a curated set of search terms (raw JSON saved under `ingest/raw/`, gitignored). It also
   writes a committed `ingest/ingest_manifest.csv` (search term, selected food id, name, type,
   timestamp, raw-response SHA-256) as provenance for the pull. Every curated food must resolve
   unless it is explicitly listed in `OPTIONAL_FOODS`; otherwise the seed is left unchanged and
   the script exits non-zero. A partial pull never overwrites a good dataset.
4. Re-run `dbt build` and the freeze step.

## Snowflake target (resume artifact)

`pip install dbt-snowflake`, set the `SF_*` env vars, then `dbt build --profiles-dir . --target snowflake`.
The models are warehouse-portable; only the profile target changes.

## Legal

Independent demo built on the public FatSecret Platform API. Not affiliated with or endorsed by
FatSecret. Only a small curated sample is stored for demo purposes; review the applicable API
terms before redistributing any derived dataset. Raw pulls are gitignored and never redistributed.
