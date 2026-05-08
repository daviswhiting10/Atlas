import "dotenv/config";
import { prisma } from "../lib/db/client";
import exercises from "../data/exercises.json";

const WORKSPACE_ID = "ws_atlas_primary";

async function main() {
  const email = process.env.SEED_TRAINER_EMAIL;
  if (!email) {
    throw new Error("SEED_TRAINER_EMAIL is required in .env.local");
  }

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
  console.log("TrainerProfile: created");

  // 4. Exercise library (global — workspaceId null)
  let count = 0;
  for (const ex of exercises) {
    await prisma.exercise.upsert({
      where: { slug: ex.slug },
      update: {},
      create: {
        name: ex.name,
        slug: ex.slug,
        pattern: ex.pattern,
        muscleGroups: ex.muscleGroups,
        equipment: ex.equipment,
        cues: ex.cues ?? null,
        regression: ex.regression ?? null,
        progression: ex.progression ?? null,
        workspaceId: null,
      },
    });
    count++;
  }
  console.log(`Exercises: ${count} seeded`);

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
