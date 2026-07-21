-- Staging: type and clean the raw landed foods. One row per food, per-100g basis.
with source as (
    select * from {{ ref('raw_food_nutrition') }}
),

typed as (
    select
        cast(food_id as integer)              as food_id,
        trim(cast(food_name as varchar))      as food_name,
        trim(cast(serving_note as varchar))   as serving_note,
        cast(energy_kcal_per_100g as double)  as energy_kcal_per_100g,
        cast(protein_g_per_100g as double)    as protein_g_per_100g,
        cast(carb_g_per_100g as double)       as carb_g_per_100g,
        cast(fat_g_per_100g as double)        as fat_g_per_100g
    from source
)

select * from typed
