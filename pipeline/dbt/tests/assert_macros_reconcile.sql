-- Data-quality test (the crown jewel): flag foods whose macro-derived (Atwater)
-- energy disagrees with stated energy beyond tolerance. Severity 'warn' so the
-- build stays green while surfacing the count of quarantined rows.
{{ config(severity = 'warn') }}

select
    food_id,
    food_name,
    energy_kcal_per_100g,
    atwater_kcal,
    reconciliation_abs_diff_kcal
from {{ ref('int_food_metrics') }}
where not energy_reconciles
