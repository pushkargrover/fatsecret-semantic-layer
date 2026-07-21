-- Per-food nutrition facts (per-100g basis). Grain: one row per food.
select
    food_id,
    food_name,
    serving_note,
    energy_kcal_per_100g,
    protein_g_per_100g,
    carb_g_per_100g,
    fat_g_per_100g
from {{ ref('stg_fatsecret__foods') }}
