/**
 * The global exercise library for the local Postgres (docs/local-postgres.md), so names resolve the same way they do on
 * dev-sessions (after the exercise cleanup's merges and renames, which prisma/seed.ts doesn't have).
 *
 *   npx tsx scripts/local-library.ts --snapshot   read dev-sessions' global library (read only) into prisma/local/library.json
 *   scripts/local-db.sh run npx tsx scripts/local-library.ts    load that file into the local Postgres
 *
 * Only global rows (workspaceId null): no workspace's own exercises, no client data.
 */
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { isLocalDatabase } from "../lib/db/local";

const FILE = join(process.cwd(), "prisma", "local", "library.json");
type Snapshot = { exercises: Record<string, unknown>[]; aliases: Record<string, unknown>[] };

async function snapshot() {
  config({ path: ".env.local", quiet: true });
  const { isProductionDatabase } = await import("../lib/db/production");
  if (isProductionDatabase(process.env.DATABASE_URL)) throw new Error("Refusing: the snapshot is taken from dev-sessions, never production.");
  if (isLocalDatabase(process.env.DATABASE_URL)) throw new Error("DATABASE_URL is the local database; the snapshot reads dev-sessions.");
  const { prisma } = await import("../lib/db/client");
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const exercises = await tx.exercise.findMany({ where: { workspaceId: null }, orderBy: { id: "asc" } });
    const aliases = await tx.exerciseAlias.findMany({ where: { workspaceId: null, exercise: { workspaceId: null } }, orderBy: { id: "asc" } });
    return { exercises, aliases };
  });
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(rows, null, 1) + "\n");
  console.log(`library snapshot: ${rows.exercises.length} exercises, ${rows.aliases.length} aliases -> prisma/local/library.json`);
}

async function load() {
  if (!isLocalDatabase(process.env.DATABASE_URL)) throw new Error("Refusing: the library is loaded into the local Postgres only (DATABASE_URL must be localhost).");
  const { prisma } = await import("../lib/db/client");
  const snap = JSON.parse(readFileSync(FILE, "utf8")) as Snapshot;
  // A merged exercise is hidden and points at its survivor. A survivor that belongs to a workspace isn't in the
  // snapshot, so those merged rows are left out (nothing shows them). Insert every row first, then the links.
  const ids = new Set(snap.exercises.map((e) => e.id));
  snap.exercises = snap.exercises.filter((e) => !e.mergedIntoId || ids.has(e.mergedIntoId));
  const kept = new Set(snap.exercises.map((e) => e.id));
  snap.aliases = snap.aliases.filter((a) => kept.has(a.exerciseId));
  const exercises = snap.exercises.map((e) => ({ ...e, mergedIntoId: null }));
  const made = await prisma.exercise.createMany({ data: exercises as never, skipDuplicates: true });
  for (const e of snap.exercises.filter((x) => x.mergedIntoId)) {
    await prisma.exercise.update({ where: { id: e.id as string }, data: { mergedIntoId: e.mergedIntoId as string } });
  }
  const aliases = await prisma.exerciseAlias.createMany({ data: snap.aliases as never, skipDuplicates: true });
  console.log(`library: ${made.count} exercises and ${aliases.count} aliases added (${snap.exercises.length} in the snapshot)`);
}

(process.argv.includes("--snapshot") ? snapshot() : load()).then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
