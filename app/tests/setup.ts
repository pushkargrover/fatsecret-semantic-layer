import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Next auto-loads .env.local for `next dev`/`build`, but Vitest does not.
// Load it here so the eval harness can see the LLM API key. `override: false`
// keeps a real shell/CI env var winning over the file.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "..", ".env.local"), override: false });

// Pin the warehouse to a committed fixture so value-specific unit tests are
// deterministic regardless of what the live demo mart currently contains.
process.env.MART_PARQUET_PATH = resolve(here, "fixtures", "mart_food_metrics.parquet");
