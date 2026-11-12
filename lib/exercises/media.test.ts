import { beforeEach, describe, expect, it, vi } from "vitest";

// Blob and the database, simulated: one coach folder, a table of uploads.
const blob = vi.hoisted(() => ({
  files: new Map<string, { pathname: string; contentType: string; size: number; uploadedAt: Date }>(),
  deleted: [] as string[],
}));
const rows = vi.hoisted(() => [] as Array<{ id: string; workspaceId: string; exerciseId: string; url: string; kind: string; sizeBytes: number }>);
const names = vi.hoisted(() => new Map<string, string>());

vi.mock("@vercel/blob", () => ({
  head: async (url: string) => {
    const f = blob.files.get(url);
    if (!f) throw new Error("not found");
    return { url, ...f };
  },
  del: async (urls: string[] | string) => {
    for (const u of ([] as string[]).concat(urls)) {
      blob.deleted.push(u);
      blob.files.delete(u);
    }
  },
  list: async ({ prefix }: { prefix: string }) => ({
    blobs: Array.from(blob.files.entries())
      .filter(([, f]) => f.pathname.startsWith(prefix))
      .map(([url, f]) => ({ url, uploadedAt: f.uploadedAt })),
    hasMore: false,
  }),
}));

vi.mock("@/lib/db/client", () => {
  const key = (w: { workspaceId_exerciseId: { workspaceId: string; exerciseId: string } }) => (r: (typeof rows)[number]) =>
    r.workspaceId === w.workspaceId_exerciseId.workspaceId && r.exerciseId === w.workspaceId_exerciseId.exerciseId;
  return {
    prisma: {
      exerciseMedia: {
        findUnique: async ({ where }: { where: Parameters<typeof key>[0] }) => rows.find(key(where)) ?? null,
        findMany: async ({ where }: { where: { workspaceId?: string; exerciseId?: string } }) =>
          rows
            .filter((r) => (!where.workspaceId || r.workspaceId === where.workspaceId) && (!where.exerciseId || r.exerciseId === where.exerciseId))
            .map((r) => ({ ...r, exercise: { name: names.get(r.exerciseId) ?? r.exerciseId } })),
        deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          for (const id of where.id.in) rows.splice(rows.findIndex((r) => r.id === id), 1);
        },
        upsert: async ({ where, create, update }: { where: Parameters<typeof key>[0]; create: (typeof rows)[number]; update: Partial<(typeof rows)[number]> }) => {
          const r = rows.find(key(where));
          if (r) Object.assign(r, update);
          else rows.push({ ...create, id: `row${Math.random()}` });
        },
        delete: async ({ where }: { where: { id: string } }) => {
          rows.splice(rows.findIndex((r) => r.id === where.id), 1);
        },
      },
      exercise: {
        delete: async () => {},
        findUnique: async ({ where }: { where: { id: string } }) => ({ name: names.get(where.id) ?? where.id }),
      },
    },
  };
});

import { deleteExercise, removeMedia, saveMedia, sweepOrphans } from "./media";

const W = "ws1";
const hourAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
function file(name: string, contentType = "image/jpeg", size = 300_000, uploadedAt = new Date()) {
  const url = `https://store.public.blob.vercel-storage.com/exercise-media/${W}/${name}`;
  blob.files.set(url, { pathname: `exercise-media/${W}/${name}`, contentType, size, uploadedAt });
  return url;
}

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = "test";
  blob.files.clear();
  blob.deleted.length = 0;
  rows.length = 0;
  names.clear();
});

describe("exercise uploads", () => {
  it("deletes the old file from Blob when an upload is replaced", async () => {
    const first = file("ex1-a.jpg");
    await saveMedia(W, "ex1", first);
    const second = file("ex1-b.mp4", "video/mp4", 5_000_000);
    await saveMedia(W, "ex1", second);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ url: second, kind: "video" });
    expect(blob.deleted).toEqual([first]);
  });

  it("treats same-named exercises as one: a new photo on either replaces the other's", async () => {
    names.set("legpress-a", "Leg Press");
    names.set("legpress-b", "leg  press");
    const first = file("lp-a.jpg");
    await saveMedia(W, "legpress-a", first);
    const second = file("lp-b.jpg");
    await saveMedia(W, "legpress-b", second);
    expect(rows.map((r) => r.url)).toEqual([second]);
    expect(blob.deleted).toEqual([first]);
    await removeMedia(W, "legpress-a");
    expect(rows).toHaveLength(0);
    expect(blob.deleted).toEqual([first, second]);
  });

  it("deletes the file when an upload is removed", async () => {
    const url = file("ex1-a.jpg");
    await saveMedia(W, "ex1", url);
    await removeMedia(W, "ex1");
    expect(rows).toHaveLength(0);
    expect(blob.deleted).toEqual([url]);
  });

  it("deletes an exercise's files when the exercise is deleted", async () => {
    const url = file("ex1-a.jpg");
    await saveMedia(W, "ex1", url);
    await deleteExercise("ex1");
    expect(blob.deleted).toContain(url);
  });

  it("refuses a file over the limit, or from another coach's folder, and deletes it", async () => {
    const big = file("ex1-big.mp4", "video/mp4", 11 * 1024 * 1024);
    await expect(saveMedia(W, "ex1", big)).rejects.toThrow(/too big/);
    expect(blob.deleted).toEqual([big]);
    await expect(saveMedia("someone-else", "ex1", file("ex1-c.jpg"))).rejects.toThrow(/isn't one of yours/);
    expect(rows).toHaveLength(0);
  });

  it("sweeps stray files left by a cascade, but never one still being saved", async () => {
    const kept = file("ex1-a.jpg", "image/jpeg", 300_000, hourAgo);
    await saveMedia(W, "ex1", kept);
    const orphan = file("ex2-old.jpg", "image/jpeg", 300_000, hourAgo);
    const fresh = file("ex3-new.jpg"); // uploaded seconds ago, not saved yet
    expect(await sweepOrphans(W)).toBe(1);
    expect(blob.deleted).toEqual([orphan]);
    expect(blob.files.has(fresh)).toBe(true);
    expect(blob.files.has(kept)).toBe(true);
  });
});
