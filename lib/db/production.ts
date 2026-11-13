/**
 * Is this the production database? Scripts that rewrite data check this
 * before touching anything.
 */

/** The Neon endpoint behind the production branch (project "Atlas"). */
const PRODUCTION_ENDPOINTS = ["ep-nameless-field"];

export function isProductionDatabase(url: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!url) return false;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return true; // unreadable: treat as production, to be safe
  }
  if (PRODUCTION_ENDPOINTS.some((ep) => host.startsWith(ep))) return true;
  if (env.PROD_DATABASE_URL && sameDatabase(url, env.PROD_DATABASE_URL)) return true;
  return env.VERCEL_ENV === "production";
}

/** Same host (pooled or not) and database. */
function sameDatabase(a: string, b: string): boolean {
  try {
    const [x, y] = [new URL(a), new URL(b)];
    const host = (u: URL) => u.hostname.replace("-pooler.", ".");
    return host(x) === host(y) && x.pathname === y.pathname;
  } catch {
    return false;
  }
}
