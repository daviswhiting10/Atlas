-- Email + password sign-in. NULL for accounts that sign in by email link,
-- and for guest accounts until they're saved.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
