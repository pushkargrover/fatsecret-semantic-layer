"""Freeze the governed mart to Parquet for the app.

After `dbt build`, export mart_food_metrics from the DuckDB warehouse to
app/data/mart_food_metrics.parquet — the exact, read-only artifact the Next.js
executor queries. The deployed app makes zero live warehouse (or API) calls.

    python -m freeze.export_parquet     # from the pipeline/ directory
"""

from __future__ import annotations

from pathlib import Path

import duckdb

HERE = Path(__file__).resolve().parent
WAREHOUSE = HERE.parent / "dbt" / "warehouse.duckdb"
OUT = HERE.parent.parent / "app" / "data" / "mart_food_metrics.parquet"


def main() -> None:
    if not WAREHOUSE.exists():
        raise SystemExit(f"No warehouse at {WAREHOUSE}. Run `dbt build` first.")
    OUT.parent.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect(str(WAREHOUSE), read_only=True)
    con.execute(
        f"COPY (SELECT * FROM mart_food_metrics ORDER BY food_id) "
        f"TO '{OUT.as_posix()}' (FORMAT PARQUET)"
    )
    (count,) = con.execute("SELECT count(*) FROM mart_food_metrics").fetchone()
    con.close()
    print(f"Froze {count} governed foods -> {OUT}")


if __name__ == "__main__":
    main()
