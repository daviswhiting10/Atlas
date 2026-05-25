import "dotenv/config";
import { defineConfig } from "prisma/config";

// Neon: the pooler URL (-pooler.) doesn't support advisory locks required
// by `prisma migrate deploy`. Derive the direct URL by removing "-pooler"
// from the hostname so migrations always use a non-pooled connection.
const rawUrl = process.env["DATABASE_URL"] ?? "";
const migrationUrl = rawUrl.replace(/-pooler(\.\S)/g, "$1");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl,
  },
});
