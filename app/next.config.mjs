import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // @duckdb/node-api ships a native .node addon; keep it external so webpack
  // doesn't try to bundle the binary, and let file tracing include it.
  serverExternalPackages: ["@duckdb/node-api"],

  // Scope file tracing to this app dir (repo root has unrelated projects).
  outputFileTracingRoot: here,

  // Force the serverless function for /api/ask to ship the frozen mart and the
  // platform-specific DuckDB binding (linux-x64 on Vercel). Without this the
  // deployed function 500s on "file not found" / missing native addon.
  outputFileTracingIncludes: {
    "/api/ask": [
      "./data/mart_food_metrics.parquet",
      "./node_modules/@duckdb/node-bindings-*/**",
    ],
  },
};

export default nextConfig;
