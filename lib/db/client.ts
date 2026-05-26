import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local and restart.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PrismaClient({ adapter } as any);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Cache on globalThis in all environments.
// - Dev: prevents multiple clients from hot-reload module churn.
// - Prod (Vercel Node.js): module cache already prevents re-execution within
//   a warm instance, but caching here makes behaviour consistent and guards
//   against any bundler edge cases that re-evaluate this module.
globalForPrisma.prisma = prisma;
