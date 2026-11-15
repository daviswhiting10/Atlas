/**
 * An in-memory stand-in for the few Prisma calls the sign-in code makes.
 * Tests only: `vi.mock("@/lib/db/client", async () => ({ prisma: (await import("@/lib/auth/test-db")).fakePrisma }))`.
 */

export type FakeUser = {
  id: string;
  email: string;
  role: "TRAINER" | "CLIENT" | "ADMIN";
  passwordHash: string | null;
  passwordChangedAt: Date | null;
  passwordPromptAfter: Date | null;
  createdAt: Date;
  emailVerified?: Date | null;
  google?: boolean;
};
type Reset = { id: string; userId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null; createdAt: Date };
type Throttle = { key: string; count: number; windowStart: Date; blockedUntil: Date | null; updatedAt: Date };

export const db = {
  users: new Map<string, FakeUser>(),
  resets: [] as Reset[],
  throttle: new Map<string, Throttle>(),
  /** Fail the next transaction after its first step (to prove nothing is half-written). */
  failNextTransaction: false,
};

export function resetDb() {
  db.users.clear();
  db.resets.length = 0;
  db.throttle.clear();
  db.failNextTransaction = false;
}

export function addUser(u: Partial<FakeUser> & { id: string; email: string }): FakeUser {
  const user: FakeUser = { role: "CLIENT", passwordHash: null, passwordChangedAt: null, passwordPromptAfter: null, createdAt: new Date("2026-05-01T00:00:00Z"), ...u };
  db.users.set(user.id, user);
  return user;
}

let seq = 0;
const view = (u: FakeUser | undefined) => (u ? { ...u, accounts: u.google ? [{ id: "google-account" }] : [] } : null);

export const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
      view(where.id ? db.users.get(where.id) : Array.from(db.users.values()).find((u) => u.email === where.email)),
    update: async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
      const u = db.users.get(where.id);
      if (!u) throw new Error("no such user");
      Object.assign(u, data);
      return view(u);
    },
  },
  passwordReset: {
    deleteMany: async ({ where }: { where: { userId: string; usedAt: null } }) => {
      const before = db.resets.length;
      db.resets = db.resets.filter((r) => !(r.userId === where.userId && r.usedAt === null));
      return { count: before - db.resets.length };
    },
    create: async ({ data }: { data: Omit<Reset, "id" | "usedAt" | "createdAt"> }) => {
      const r = { id: `reset-${++seq}`, usedAt: null, createdAt: new Date(), ...data };
      db.resets.push(r);
      return r;
    },
    findUnique: async ({ where }: { where: { tokenHash: string } }) => db.resets.find((r) => r.tokenHash === where.tokenHash) ?? null,
    updateMany: async ({ where, data }: { where: { id: string; usedAt: null; expiresAt: { gt: Date } }; data: { usedAt: Date } }) => {
      const r = db.resets.find((x) => x.id === where.id && x.usedAt === null && x.expiresAt > where.expiresAt.gt);
      if (!r) return { count: 0 };
      r.usedAt = data.usedAt;
      return { count: 1 };
    },
  },
  authThrottle: {
    findUnique: async ({ where }: { where: { key: string } }) => db.throttle.get(where.key) ?? null,
    upsert: async ({ where, create, update }: { where: { key: string }; create: Omit<Throttle, "updatedAt">; update: Omit<Throttle, "key" | "updatedAt"> }) => {
      const prev = db.throttle.get(where.key);
      const row = prev ? { ...prev, ...update, updatedAt: new Date() } : { ...create, updatedAt: new Date() };
      db.throttle.set(where.key, row);
      return row;
    },
    deleteMany: async ({ where }: { where: { key?: string; updatedAt?: { lt: Date } } }) => {
      let n = 0;
      for (const [k, row] of Array.from(db.throttle)) {
        if ((where.key !== undefined && k === where.key) || (where.updatedAt && row.updatedAt < where.updatedAt.lt)) {
          db.throttle.delete(k);
          n++;
        }
      }
      return { count: n };
    },
  },
  async $transaction<T>(arg: Promise<unknown>[] | ((tx: unknown) => Promise<T>)): Promise<unknown> {
    if (Array.isArray(arg)) return Promise.all(arg);
    // Run against a copy, and keep it only if the whole callback succeeds.
    const saved = { users: new Map(Array.from(db.users, ([k, u]) => [k, { ...u }])), resets: db.resets.map((r) => ({ ...r })) };
    try {
      const out = await arg(fakePrisma);
      if (db.failNextTransaction) {
        db.failNextTransaction = false;
        throw new Error("transaction failed");
      }
      return out;
    } catch (err) {
      db.users = saved.users;
      db.resets = saved.resets;
      throw err;
    }
  },
};
