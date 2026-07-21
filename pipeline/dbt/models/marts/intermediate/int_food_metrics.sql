-- Intermediate: compute the three governed metrics plus the energy-reconciliation
-- signal, for every food. Downstream, mart_food_metrics keeps the reconciling rows
-- and rej_energy_reconciliation quarantines the rest.
--
-- Atwater factors: protein 4, carbohydrate 4, fat 9 kcal/g.
-- Reconciliation tolerance band: |Atwater - stated| <= max(10 kcal, 10% of stated).
with facts as (
    select * from {{ ref('fct_food_nutrition') }}
),

atwater as (
    select
        *,
        protein_g_per_100g * 4.0 as protein_kcal,
        carb_g_per_100g    * 4.0 as carb_kcal,
        fat_g_per_100g     * 9.0 as fat_kcal
    from facts
),

computed as (
    select
        *,
        (protein_kcal + carb_kcal + fat_kcal) as atwater_kcal
    from atwater
)

select
    food_id,
    food_name,
    serving_note,
    energy_kcal_per_100g,
    protein_g_per_100g,
    carb_g_per_100g,
    fat_g_per_100g,

    -- metric 1: calories per 100 g (stated)
    energy_kcal_per_100g as calories_per_100g,

    -- metric 2: macro split (% of Atwater macro energy; sums to 100)
    cast(100.0 * protein_kcal / nullif(atwater_kcal, 0) as double) as protein_pct_energy,
    cast(100.0 * carb_kcal    / nullif(atwater_kcal, 0) as double) as carb_pct_energy,
    cast(100.0 * fat_kcal     / nullif(atwater_kcal, 0) as double) as fat_pct_energy,

    -- metric 3: protein density (g protein per 100 kcal)
    cast(100.0 * protein_g_per_100g / nullif(energy_kcal_per_100g, 0) as double) as protein_g_per_100kcal,

    -- reconciliation signal
    cast(atwater_kcal as double) as atwater_kcal,
    cast(abs(atwater_kcal - energy_kcal_per_100g) as double) as reconciliation_abs_diff_kcal,
    (abs(atwater_kcal - energy_kcal_per_100g) <= greatest(10.0, 0.10 * energy_kcal_per_100g)) as energy_reconciles

from computed
