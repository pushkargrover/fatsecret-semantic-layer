-- Governed query for metric: macro_split
-- The single bind parameter is food_id (bound by the executor; never string-interpolated).
SELECT
  food_id,
  food_name,
  serving_note,
  protein_pct_energy,
  carb_pct_energy,
  fat_pct_energy
FROM mart_food_metrics
WHERE food_id = ?
