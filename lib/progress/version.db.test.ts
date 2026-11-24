/**
 * The Progress fingerprint against a dev database (never production): every kind of write to a client's sets and
 * sessions changes it, and another client's writes don't. All inside one transaction that is rolled back.
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/progress/version.db.test.ts
 */
import { describe, expect, it } from "vitest";

const RUN = !!process.env.ATLAS_DB_TEST;
class Rollback extends Error {}

describe.skipIf(!RUN)("progress fingerprint (dev database)", () => {
  it("changes on every write Progress can see, and only for that client", async () => {
    const { prisma } = await import("@/lib/db/client");
    const { PROGRESS_VERSION_SQL } = await import("./version");
    if (/ep-nameless-field/.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing production");
    const set = await prisma.setLog.findFirst({ where: { weight: { not: null }, reps: { not: null }, exerciseId: { not: null } }, select: { id: true, workoutLogId: true, exerciseId: true, workoutLog: { select: { clientId: true } } } });
    const other = await prisma.workoutLog.findFirst({ where: { clientId: { not: set!.workoutLog.clientId }, sets: { some: {} } }, select: { clientId: true, sets: { take: 1, select: { id: true } } } });
    expect(set && other).toBeTruthy();
    const clientId = set!.workoutLog.clientId;
    const seen: string[] = [];
    await prisma
      .$transaction(async (tx) => {
        const v = async () => (await tx.$queryRaw<Array<{ v: string }>>(PROGRESS_VERSION_SQL(clientId)))[0].v;
        const step = async (write: () => Promise<unknown>) => { const before = await v(); await write(); const after = await v(); seen.push(after); expect(after).not.toBe(before); };
        const first = await v();
        expect(await v()).toBe(first); // stable when nothing changed
        await step(() => tx.setLog.update({ where: { id: set!.id }, data: { weight: { increment: 5 } } }));
        await step(() => tx.setLog.update({ where: { id: set!.id }, data: { reps: { increment: 1 } } }));
        await step(() => tx.setLog.update({ where: { id: set!.id }, data: { completed: { set: false } } }));
        await step(() => tx.setLog.update({ where: { id: set!.id }, data: { weight: null } }));
        await step(() => tx.setLog.create({ data: { workoutLogId: set!.workoutLogId, exerciseId: set!.exerciseId, setNumber: 99, weight: 1, reps: 1, completed: true } }));
        await step(() => tx.workoutLog.update({ where: { id: set!.workoutLogId }, data: { date: new Date("2001-01-01T12:00:00Z") } }));
        await step(() => tx.workoutLog.update({ where: { id: set!.workoutLogId }, data: { completedAt: null } }));
        await step(() => tx.workoutLog.update({ where: { id: set!.workoutLogId }, data: { assignedWorkoutId: null } }));
        await step(() => tx.setLog.deleteMany({ where: { workoutLogId: set!.workoutLogId } }));
        // Another client's set changing leaves this client's fingerprint alone.
        const mine = await v();
        await tx.setLog.update({ where: { id: other!.sets[0].id }, data: { reps: { increment: 1 } } });
        expect(await v()).toBe(mine);
        throw new Rollback();
      }, { timeout: 60_000 })
      .catch((e) => { if (!(e instanceof Rollback)) throw e; });
    expect(new Set(seen).size).toBe(seen.length);
  }, 90_000);
});
