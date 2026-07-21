-- Governed query for metric: calories_per_100g
-- The single bind parameter is food_id (bound by the executor; never string-interpolated).
SELECT
  food_id,
  food_name,
  serving_note,
  calories_per_100g
FROM mart_food_metrics
WHERE food_id = ?
