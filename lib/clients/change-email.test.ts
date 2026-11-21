import { beforeEach, describe, expect, it, vi } from "vitest";

// A small in-memory database: clients, logins and sign-in links.
const db = vi.hoisted(() => ({
  clients: [] as Array<{ id: string; workspaceId: string; email: string | null; userId: string | null; deletedAt: Date | null }>,
  users: [] as Array<{ id: string; email: string; passwordHash: string | null; role: string }>,
  tokens: [] as Array<{ identifier: string }>,
}));
vi.mock("@/lib/db/client", () => {
  const tx = {
    clientProfile: {
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) => db.clients.find((c) => c.id === where.id && c.workspaceId === where.workspaceId && !c.deletedAt) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { email: string | null } }) => Object.assign(db.clients.find((c) => c.id === where.id)!, data),
    },
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => db.users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { email: string } }) => Object.assign(db.users.find((u) => u.id === where.id)!, data),
    },
    verificationToken: {
      deleteMany: async ({ where }: { where: { identifier: string } }) => {
        const before = db.tokens.length;
        db.tokens = db.tokens.filter((t) => t.identifier !== where.identifier);
        return { count: before - db.tokens.length };
      },
    },
  };
  return { prisma: { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { changeClientEmail } from "./change-email";

beforeEach(() => {
  db.clients = [{ id: "c1", workspaceId: "w1", email: "will@icloud.con", userId: "u1", deletedAt: null }];
  db.users = [
    { id: "u1", email: "will@icloud.con", passwordHash: "kept", role: "CLIENT" },
    { id: "u2", email: "taken@icloud.com", passwordHash: null, role: "CLIENT" },
    { id: "coach", email: "coach@x.com", passwordHash: "coach's", role: "TRAINER" },
  ];
  db.tokens = [{ identifier: "will@icloud.con" }];
});

describe("changeClientEmail", () => {
  it("corrects the client AND her login together, keeping her password; old links for the old address stop working", async () => {
    expect(await changeClientEmail("c1", "w1", "  Will@iCloud.com ")).toEqual({ ok: true, changed: true });
    expect(db.clients[0].email).toBe("will@icloud.com");
    expect(db.users[0]).toEqual({ id: "u1", email: "will@icloud.com", passwordHash: "kept", role: "CLIENT" });
    expect(db.tokens).toHaveLength(0);
  });
  it("refuses an address another account already uses, and changes nothing", async () => {
    expect(await changeClientEmail("c1", "w1", "taken@icloud.com")).toMatchObject({ ok: false, status: 409 });
    expect(db.clients[0].email).toBe("will@icloud.con");
    expect(db.users[0].email).toBe("will@icloud.con");
  });
  it("won't empty the email of a client who signs in with it, or accept something that isn't an email", async () => {
    expect(await changeClientEmail("c1", "w1", "")).toMatchObject({ ok: false, status: 400 });
    expect(await changeClientEmail("c1", "w1", "not an email")).toMatchObject({ ok: false, status: 400 });
    expect(db.users[0].email).toBe("will@icloud.con");
  });
  it("a client without a login: only her record changes (and it may be cleared)", async () => {
    db.clients[0].userId = null;
    expect(await changeClientEmail("c1", "w1", "new@x.com")).toEqual({ ok: true, changed: true });
    expect(db.clients[0].email).toBe("new@x.com");
    expect(db.users[0].email).toBe("will@icloud.con");
    expect(await changeClientEmail("c1", "w1", "")).toEqual({ ok: true, changed: true });
    expect(db.clients[0].email).toBeNull();
  });
  it("only within the coach's own workspace", async () => {
    expect(await changeClientEmail("c1", "other-workspace", "will@icloud.com")).toMatchObject({ ok: false, status: 404 });
    expect(db.users[0].email).toBe("will@icloud.con");
  });
  it("never changes a coach's login (a coach's own training profile is linked to it)", async () => {
    db.clients[0] = { id: "c1", workspaceId: "w1", email: "coach@x.com", userId: "coach", deletedAt: null };
    expect(await changeClientEmail("c1", "w1", "other@x.com")).toEqual({ ok: true, changed: true });
    expect(db.users.find((u) => u.id === "coach")!.email).toBe("coach@x.com");
  });
  it("the same address again is not a change", async () => {
    expect(await changeClientEmail("c1", "w1", "WILL@icloud.con")).toEqual({ ok: true, changed: false });
  });
});
