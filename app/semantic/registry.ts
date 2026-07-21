import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { Registry, type MetricDef } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(HERE, "registry.yaml");

/** Parse + validate the registry once, at module load. Throws on any violation. */
function loadRegistry(): Registry {
  const raw = parseYaml(readFileSync(REGISTRY_PATH, "utf8"));
  const registry = Registry.parse(raw);

  const names = registry.map((m) => m.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) {
    throw new Error(`Duplicate metric name(s) in registry: ${dupes.join(", ")}`);
  }
  return registry;
}

const REGISTRY = loadRegistry();
const BY_NAME = new Map<string, MetricDef>(REGISTRY.map((m) => [m.name, m]));

/** Cache of governed SQL templates, keyed by metric name. */
const SQL_CACHE = new Map<string, string>();

export function getRegistry(): Registry {
  return REGISTRY;
}

export function getMetric(name: string): MetricDef | undefined {
  return BY_NAME.get(name);
}

/** The canonical list of metric names — the single source for the LLM's enum. */
export function metricNames(): string[] {
  return REGISTRY.map((m) => m.name);
}

/** Load (and cache) the governed SQL for a metric. */
export function getSqlTemplate(metric: MetricDef): string {
  const cached = SQL_CACHE.get(metric.name);
  if (cached !== undefined) return cached;
  const sql = readFileSync(resolve(HERE, metric.sql_template), "utf8").trim();
  SQL_CACHE.set(metric.name, sql);
  return sql;
}

/**
 * Exactly what the LLM is shown: metric names and their plain-English purpose.
 * No SQL, no columns, no table names — the model selects a question, nothing more.
 */
export function registryForLLM(): Array<{ name: string; plain_english: string }> {
  return REGISTRY.map((m) => ({ name: m.name, plain_english: m.plain_english }));
}
