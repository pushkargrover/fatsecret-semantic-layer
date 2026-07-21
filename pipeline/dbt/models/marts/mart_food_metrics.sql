-- The governed mart the semantic layer queries. One row per food, only foods whose
-- macros reconcile to stated energy within tolerance. Column names match the
-- registry's governed SQL exactly. This is the table frozen to Parquet for the app.
select
    food_id,
    food_name,
    serving_note,
    energy_kcal_per_100g,
    protein_g_per_100g,
    carb_g_per_100g,
    fat_g_per_100g,
    calories_per_100g,
    protein_pct_energy,
    carb_pct_energy,
    fat_pct_energy,
    protein_g_per_100kcal,
    atwater_kcal,
    reconciliation_abs_diff_kcal,
    energy_reconciles
from {{ ref('int_food_metrics') }}
where energy_reconciles
