import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/db/client";
import { SEED_EXERCISES } from "../data/exercise-seed";

const WORKSPACE_ID = "ws_atlas_primary";

// Free-exercise-db raw shape
type RawExercise = {
  id: string;
  name: string;
  equipment: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  images: string[];
  category: string;
  force?: string;
  level?: string;
  mechanic?: string;
};

const GIF_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildGifUrl(raw: RawExercise): string | null {
  if (!raw.images?.length) return null;
  // images[0] is like "ExerciseName/0.jpg"
  return `${GIF_BASE}/${raw.images[0]}`;
}

async function main() {
  const email = process.env.SEED_TRAINER_EMAIL;
  if (!email) throw new Error("SEED_TRAINER_EMAIL is required in .env");

  // 1. Workspace
  const workspace = await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    update: {},
    create: { id: WORKSPACE_ID, name: "Atlas" },
  });
  console.log("Workspace:", workspace.id);

  // 2. Trainer user
  const user = await prisma.user.upsert({
    where: { email },
    update: { workspaceId: workspace.id, role: "TRAINER" },
    create: {
      email,
      name: process.env.SEED_TRAINER_NAME ?? "Davis Whiting",
      role: "TRAINER",
      workspaceId: workspace.id,
    },
  });
  console.log("User:", user.email, `(${user.role})`);

  // 3. TrainerProfile
  await prisma.trainerProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      bio: "NASM CPT, NASM CNC. Life Time Fitness, Columbia MD.",
      certifications: ["NASM CPT", "NASM CNC"],
    },
  });
  console.log("TrainerProfile: ok");

  // 4. Exercise library
  const rawPath = join(process.cwd(), "data", "exercise-db-raw.json");
  if (!existsSync(rawPath)) {
    console.warn(
      "⚠  data/exercise-db-raw.json not found. Run: npx tsx scripts/fetch-exercise-db.ts"
    );
    console.log("\nSeed complete (no exercises seeded).");
    return;
  }

  const rawExercises: RawExercise[] = JSON.parse(
    readFileSync(rawPath, "utf-8")
  );

  // Build lookup: slug → raw exercise
  const rawBySlug = new Map<string, RawExercise>();
  for (const raw of rawExercises) {
    rawBySlug.set(slugify(raw.name), raw);
  }

  let seeded = 0;
  let skipped = 0;

  for (const entry of SEED_EXERCISES) {
    const slug = slugify(entry.name);
    const raw = rawBySlug.get(slug);

    if (!raw) {
      console.warn(`  skip (not in raw DB): "${entry.name}" [${slug}]`);
      skipped++;
      continue;
    }

    await prisma.exercise.upsert({
      where: { slug },
      update: {
        movementPattern: entry.movementPattern,
        coachingCues: entry.coachingCues ?? [],
        gifUrl: buildGifUrl(raw),
        primaryMuscles: raw.primaryMuscles,
        secondaryMuscles: raw.secondaryMuscles,
        equipment: raw.equipment ?? "body only",
        instructions: raw.instructions,
      },
      create: {
        name: raw.name,
        slug,
        movementPattern: entry.movementPattern,
        primaryMuscles: raw.primaryMuscles,
        secondaryMuscles: raw.secondaryMuscles,
        equipment: raw.equipment ?? "body only",
        instructions: raw.instructions,
        gifUrl: buildGifUrl(raw),
        coachingCues: entry.coachingCues ?? [],
        workspaceId: null,
      },
    });
    seeded++;
  }

  console.log(`Exercises: ${seeded} seeded, ${skipped} skipped (not in raw DB)`);

  console.log("\nSeed complete.");
  console.log("Next: npm run seed:methodology");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
