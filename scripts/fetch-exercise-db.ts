/**
 * Source:  https://github.com/yuhonas/free-exercise-db
 * License: CC0 1.0 Universal (public domain) — no attribution required
 * Pulled:  2026-05-13
 *
 * Fetches the full exercise list and writes to data/exercise-db-raw.json.
 * Run only when you want to refresh from upstream:
 *   npx tsx scripts/fetch-exercise-db.ts
 * The output is committed to the repo so seeds are reproducible offline.
 */
import { writeFileSync } from "fs";
import { join } from "path";

const URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

async function main() {
  console.log("Fetching free-exercise-db...");
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const outPath = join(process.cwd(), "data", "exercise-db-raw.json");
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`✓ ${data.length} exercises written to data/exercise-db-raw.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
