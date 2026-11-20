/**
 * A sign-in never waits on the cleanup. Against a dev database (never production):
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/guest-cleanup-after.db.test.ts
 * It makes one demo, ages it to 7 h, signs a new try-it guest in, and checks that
 * the sign-in returned while the cleanup was still running, and that the cleanup
 * then deleted the 2 oldest expired demos (dev may hold older ones than ours).
 */
import { describe, expect, it, vi } from "vitest";

const handed: Promise<unknown>[] = [];
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => void handed.push(p) }));

const RUN = !!process.env.ATLAS_DB_TEST;

describe.skipIf(!RUN)("the cleanup runs after the response (dev database)", () => {
  it("sign-in returns before an old demo is deleted; the cleanup then deletes it", async () => {
    const { prisma } = await import("@/lib/db/client");
    const { createDemo, createGuest } = await import("@/lib/guest");
    const { deleteGuestWorkspace, findExpiredGuestWorkspaces } = await import("@/lib/guest-cleanup");
    const { randomUUID } = await import("crypto");

    const old = await createDemo(`${randomUUID()}@guest.atlas.app`);
    await prisma.workspace.update({ where: { id: old.workspaceId }, data: { createdAt: new Date(Date.now() - 7 * 3_600_000) } });
    const oldest = (await findExpiredGuestWorkspaces(2)).map((w) => w.id); // what a run takes: the 2 oldest
    expect(oldest.length).toBeGreaterThan(0);
    let fresh: { workspaceId: string } | null = null;
    try {
      let settled = false;
      const t0 = Date.now();
      fresh = await createGuest({ name: "After-response test" });
      const signInMs = Date.now() - t0;
      expect(handed).toHaveLength(1);
      handed[0].then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false); // sign-in is done; the delete has not finished

      const t1 = Date.now();
      await handed[0];
      const cleanupMs = Date.now() - t1;
      console.log(`sign-in ${signInMs} ms; cleanup finished ${cleanupMs} ms after the sign-in returned`);
      expect(cleanupMs).toBeGreaterThan(300); // the work was still ahead of us when sign-in returned
      expect(await prisma.workspace.count({ where: { id: { in: oldest } } })).toBe(0); // at most 2 per run
    } finally {
      if (await prisma.workspace.count({ where: { id: old.workspaceId } })) await deleteGuestWorkspace(old.workspaceId).catch(() => {});
      if (fresh) await deleteGuestWorkspace(fresh.workspaceId, { includeAthletes: true, ttlMs: 0 }).catch(() => {});
    }
  }, 120_000);
});
