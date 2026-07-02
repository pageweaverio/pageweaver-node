// Refresh the committed OpenAPI snapshot the drift test checks against.
//
//   pnpm --filter @pageweaver/sdk sync:openapi
//   PAGEWEAVER_OPENAPI_URL=https://api.pageweaver.io/openapi.json pnpm --filter @pageweaver/sdk sync:openapi
//
// Run this whenever the public API surface changes, then re-run the tests: a diff in
// src/__fixtures__/openapi.snapshot.json (or a failing openapi-drift.test.ts) is the signal that the
// hand-written SDK types + the drift test's expectations need updating to match.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const url =
  process.env.PAGEWEAVER_OPENAPI_URL ??
  process.argv[2] ??
  "http://localhost:4000/openapi.json";

const dest = fileURLToPath(new URL("../src/__fixtures__/openapi.snapshot.json", import.meta.url));

try {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} responded ${res.status}`);
  const spec = await res.json();
  // Stable, 2-space formatting with a trailing newline so diffs stay minimal.
  await writeFile(dest, JSON.stringify(spec, null, 2) + "\n");
  const paths = Object.keys(spec.paths ?? {}).length;
  console.log(`Wrote ${dest}\n  ${spec.info?.title} v${spec.info?.version} — ${paths} paths`);
} catch (err) {
  console.error(`Failed to fetch OpenAPI spec from ${url}`);
  console.error(`  ${err instanceof Error ? err.message : err}`);
  console.error("Is the API running? Start it with `pnpm dev:local` or set PAGEWEAVER_OPENAPI_URL.");
  process.exit(1);
}
