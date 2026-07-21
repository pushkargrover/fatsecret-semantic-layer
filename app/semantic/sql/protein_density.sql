-- Governed query for metric: protein_density
-- The single bind parameter is food_id (bound by the executor; never string-interpolated).
SELECT
  food_id,
  food_name,
  serving_note,
  protein_g_per_100kcal
FROM mart_food_metrics
WHERE food_id = ?
