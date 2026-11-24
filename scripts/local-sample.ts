/**
 * Sample data for the local Postgres (docs/local-postgres.md): the demo coach "Alex" with five clients, five months
 * of their own training, a finished goal and sessions the coach hasn't seen. Nobody in it has a real email.
 * Refuses any database that isn't on this machine. Re-running adds nothing if the sample is already there.
 *   scripts/local-db.sh run npx tsx scripts/local-sample.ts
 */
import "dotenv/config";
import { isLocalDatabase } from "../lib/db/local";

const SAMPLE_EMAIL = "sample-coach@example.test";

async function main() {
  if (!isLocalDatabase(process.env.DATABASE_URL)) {
    console.error("Refusing: local-sample only writes to the local Postgres (DATABASE_URL must be localhost).");
    process.exit(1);
  }
  const { prisma } = await import("../lib/db/client");
  // The primary workspace exists on every Neon branch (some DB tests read it); here it is empty.
  await prisma.workspace.upsert({ where: { id: "ws_atlas_primary" }, update: {}, create: { id: "ws_atlas_primary", name: "Atlas" } });
  if (await prisma.user.findUnique({ where: { email: SAMPLE_EMAIL }, select: { id: true } })) {
    console.log("sample: already there");
    return;
  }
  const { createDemo } = await import("../lib/guest");
  await createDemo(SAMPLE_EMAIL);
  console.log("sample: demo coach Alex, five clients, five months of training");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
