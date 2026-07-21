-- Quarantine: foods whose macro-derived (Atwater) energy disagrees with stated
-- energy beyond tolerance. Excluded from the governed mart so bad data can never
-- surface as an answer; kept here for visibility and data-quality triage.
select
    food_id,
    food_name,
    serving_note,
    energy_kcal_per_100g,
    atwater_kcal,
    reconciliation_abs_diff_kcal
from {{ ref('int_food_metrics') }}
where not energy_reconciles
