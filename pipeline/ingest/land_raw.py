"""Land a small curated slice of FatSecret foods into the raw layer.

For each curated search term: search -> take the top hit -> fetch full detail ->
save the raw JSON (kept local, gitignored) -> normalise to per-100g facts. The
normalised rows are written to the dbt seed `raw_food_nutrition.csv`, which is the
single raw source the dbt project reads.

It also writes a committed, non-sensitive `ingest_manifest.csv` recording exactly
which food each search term resolved to, when, and the SHA-256 of the raw response
— provenance for the "pulled from the API" claim without redistributing raw data.

The pull is governed: unless every required food resolves, the seed is left
UNCHANGED and the script exits non-zero, so a partial pull can never silently
replace a good dataset.

Run this only after you have FatSecret credentials in pipeline/.env. Without it,
the committed CSV stands in so the dbt pipeline is runnable offline.

    python -m ingest.land_raw        # from the pipeline/ directory
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from ingest.fatsecret_client import FatSecretClient

# A small, defensible slice — proves the architecture without mirroring their DB.
CURATED_FOODS = [
    "grilled chicken breast", "roasted chicken breast", "almonds", "cooked white rice",
    "broccoli", "cooked salmon", "boiled egg", "banana",
    "cheddar cheese", "cooked lentils", "olive oil", "nonfat greek yogurt",
    "oats", "peanut butter", "avocado", "baked sweet potato",
    "cooked quinoa", "firm tofu", "whole milk", "apple",
]

# Governance gate: EVERY curated food must resolve, or the seed is left unchanged.
# List here any term that is explicitly allowed to be missing (none by default).
OPTIONAL_FOODS: set[str] = set()

HERE = Path(__file__).resolve().parent
RAW_DIR = HERE / "raw"
SEED_CSV = HERE.parent / "dbt" / "seeds" / "raw_food_nutrition.csv"
MANIFEST_CSV = HERE / "ingest_manifest.csv"

CSV_COLUMNS = [
    "food_id", "food_name", "serving_note",
    "energy_kcal_per_100g", "protein_g_per_100g", "carb_g_per_100g", "fat_g_per_100g",
]
MANIFEST_COLUMNS = [
    "search_term", "selected_food_id", "food_name", "food_type", "pulled_at", "raw_sha256",
]


def pick_hit(hits: list[dict], term: str) -> dict:
    """Choose the best search hit: prefer FatSecret's canonical 'Generic' foods,
    then the one whose name overlaps the search term most. Avoids branded/recipe
    entries like 'Banana Raw Almond Butter' winning for 'banana'."""
    generics = [h for h in hits if h.get("food_type") == "Generic"]
    pool = generics or hits
    term_words = set(term.lower().split())

    def score(h: dict) -> tuple:
        name = str(h.get("food_name", "")).lower()
        name_words = name.split()
        inter = len(term_words & set(name_words))
        # coverage of the name by matched words favours concise, on-topic entries
        # ("Apple" over "Apple Banana Cake"); exact match wins outright.
        ratio = inter / len(name_words) if name_words else 0.0
        exact = 1 if name == term.lower() else 0
        return (exact, inter, ratio, -len(name_words))

    return max(pool, key=score)


def _as_float(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def normalise_to_per_100g(food: dict) -> dict | None:
    """Scale a food's gram-based serving to per-100g facts. None if no gram serving."""
    detail = food.get("food", {})
    servings = detail.get("servings", {}).get("serving", [])
    if isinstance(servings, dict):
        servings = [servings]

    for s in servings:
        if s.get("metric_serving_unit") != "g":
            continue
        grams = _as_float(s.get("metric_serving_amount"))
        kcal = _as_float(s.get("calories"))
        protein = _as_float(s.get("protein"))
        carb = _as_float(s.get("carbohydrate"))
        fat = _as_float(s.get("fat"))
        if not grams or None in (kcal, protein, carb, fat):
            continue
        factor = 100.0 / grams
        return {
            "food_id": int(detail["food_id"]),
            "food_name": detail.get("food_name", ""),
            "serving_note": s.get("serving_description", ""),
            "energy_kcal_per_100g": round(kcal * factor, 1),
            "protein_g_per_100g": round(protein * factor, 2),
            "carb_g_per_100g": round(carb * factor, 2),
            "fat_g_per_100g": round(fat * factor, 2),
        }
    return None


def main() -> None:
    load_dotenv(HERE.parent / ".env")
    client_id = os.environ.get("FATSECRET_CLIENT_ID")
    client_secret = os.environ.get("FATSECRET_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise SystemExit("Set FATSECRET_CLIENT_ID / FATSECRET_CLIENT_SECRET in pipeline/.env")

    client = FatSecretClient(client_id=client_id, client_secret=client_secret)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    rows: list[dict] = []
    manifest: list[dict] = []
    for term in CURATED_FOODS:
        try:
            hits = client.search_foods(term, max_results=20)
            if not hits:
                print(f"  (no result) {term}")
                continue
            hit = pick_hit(hits, term)
            detail = client.get_food(hit["food_id"])
            raw_text = json.dumps(detail, indent=2)
            (RAW_DIR / f"{hit['food_id']}.raw.json").write_text(raw_text)

            normalised = normalise_to_per_100g(detail)
            if normalised is None:
                print(f"  (no gram serving) {term}")
                continue
            rows.append(normalised)
            manifest.append({
                "search_term": term,
                "selected_food_id": normalised["food_id"],
                "food_name": normalised["food_name"],
                "food_type": hit.get("food_type", ""),
                "pulled_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "raw_sha256": hashlib.sha256(raw_text.encode("utf-8")).hexdigest(),
            })
            print(f"  ok  {normalised['food_name']}")
        except Exception as err:  # one bad food must not abort the whole pull
            print(f"  (failed) {term}: {err}")

    # Governance gate: never overwrite a good seed with a partial pull. Every
    # curated term must resolve unless it is explicitly whitelisted as optional.
    resolved = {m["search_term"] for m in manifest}
    missing = [t for t in CURATED_FOODS if t not in OPTIONAL_FOODS and t not in resolved]
    if missing:
        raise SystemExit(
            f"{len(missing)}/{len(CURATED_FOODS)} required food(s) did not resolve: "
            f"{', '.join(missing)}. Seed left unchanged."
        )

    SEED_CSV.parent.mkdir(parents=True, exist_ok=True)
    with SEED_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    with MANIFEST_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=MANIFEST_COLUMNS)
        writer.writeheader()
        writer.writerows(manifest)
    print(f"\nWrote {len(rows)} foods -> {SEED_CSV}")
    print(f"Wrote provenance manifest -> {MANIFEST_CSV}")


if __name__ == "__main__":
    main()
