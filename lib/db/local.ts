/**
 * The local Postgres (Docker, docs/local-postgres.md): a plain Postgres on this machine, for fuzz runs and the Monday
 * loop, so they never touch Neon. Pure.
 */

/** A database on this machine (localhost, 127.0.0.1, ::1). Unreadable URLs are not local. */
export function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Which database a script should use. `--db local` (the default when DATABASE_URL_LOCAL is set) or `--db neon`
 * (DATABASE_URL, the dev-sessions branch). `local` without DATABASE_URL_LOCAL is an error, never a silent fall back
 * to Neon.
 */
export function pickDatabase(argv: string[], env: Record<string, string | undefined>): { which: "local" | "neon"; url: string } {
  const i = argv.indexOf("--db");
  const asked = i >= 0 ? argv[i + 1] : undefined;
  if (asked && asked !== "local" && asked !== "neon") throw new Error(`--db must be local or neon (got ${asked}).`);
  const which: "local" | "neon" = asked === "local" || asked === "neon" ? asked : env.DATABASE_URL_LOCAL ? "local" : "neon";
  if (which === "local") {
    if (!env.DATABASE_URL_LOCAL) throw new Error("--db local, but DATABASE_URL_LOCAL is not set (see docs/local-postgres.md).");
    if (!isLocalDatabase(env.DATABASE_URL_LOCAL)) throw new Error("DATABASE_URL_LOCAL must point at this machine (localhost).");
    return { which, url: env.DATABASE_URL_LOCAL };
  }
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set (.env.local).");
  return { which, url: env.DATABASE_URL };
}
