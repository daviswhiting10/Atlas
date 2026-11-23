/**
 * The suggestions for Chloe's sheet against a real exercise library (dev-sessions, a copy of production's).
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/programs/dedupe.db.test.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.ATLAS_DB_TEST)("soft dedupe on a real library", () => {
  it("Chloe's cued names point at library exercises; nothing is created", async () => {
    const { prisma } = await import("@/lib/db/client");
    const { exerciseMatches } = await import("./dedupe-server");
    const { extractionToGrid, parseExtraction } = await import("./extract");
    const grid = extractionToGrid(parseExtraction(readFileSync(join(__dirname, "fixtures", "chloe-4wk-glute.reply.json"), "utf8"))!);
    const before = await prisma.exercise.count();
    const ws = (await prisma.workspace.findFirstOrThrow({ where: { id: "ws_atlas_primary" }, select: { id: true } })).id;
    const matches = await exerciseMatches(grid, ws);
    if (process.env.SHOW) console.log(matches.map((m) => `${m.name} -> ${m.match}${m.cue ? ` [${m.cue}]` : ""}`).join("\n"));
    expect(matches.find((m) => m.name.startsWith("Hip thrust (lighter"))?.match).toMatch(/^hip thrust$/i);
    expect(matches.find((m) => m.name.startsWith("Leg press (feet"))?.match).toMatch(/^leg press$/i);
    expect(await prisma.exercise.count()).toBe(before);
  }, 120_000);
});
