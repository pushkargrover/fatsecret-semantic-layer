-- Governed food dimension: the name -> id map used for deterministic entity
-- resolution. The LLM never sees ids; resolution happens against this.
select
    food_id,
    food_name,
    serving_note
from {{ ref('stg_fatsecret__foods') }}
