// Shared by the visual-review scripts: Playwright, and a signed-in browser context for a LOCAL build.
// The session cookie is minted with the AUTH_SECRET in .env.local (a local build only; never against a deployed site)
// for a local user id, with the fields the jwt callback sets at sign-in (lib/auth.ts).
// Env: PLAYWRIGHT_DIR (default ~/Documents/atlas-tools/node_modules/playwright).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PW = process.env.PLAYWRIGHT_DIR ?? path.join(os.homedir(), "Documents/atlas-tools/node_modules/playwright");
export const { chromium, devices } = await import(path.join(PW, "index.mjs"));
const { encode } = await import(path.join(REPO, "node_modules/@auth/core/jwt.js"));

export const SIZES = {
  mobile: { ...devices["iPhone 13"], defaultBrowserType: undefined },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};

const COOKIE = "authjs.session-token";

/** A browser context signed in as { userId, workspaceId, role } on a local base URL. */
export async function signedIn(browser, base, opts, { userId, workspaceId, role = "TRAINER", clientProfileId }) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error("signedIn is for a local build only");
  const env = fs.readFileSync(path.join(REPO, ".env.local"), "utf8");
  const secret = (env.match(/^AUTH_SECRET=(.*)$/m)?.[1] ?? "").replace(/^"|"$/g, "");
  if (!secret) throw new Error("no AUTH_SECRET in .env.local");
  const token = await encode({
    salt: COOKIE,
    secret,
    token: { sub: userId, id: userId, role, workspaceId, ...(clientProfileId ? { clientProfileId } : {}), pwc: 0, chk: Date.now(), np: false, snz: false },
  });
  const ctx = await browser.newContext(opts);
  await ctx.addCookies([{ name: COOKIE, value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
  return ctx;
}

/** Notes for run.log, printed as they come. */
export function logger(out) {
  const notes = [];
  return {
    log: (s) => (console.log(s), notes.push(s)),
    save: () => fs.writeFileSync(path.join(out, "run.log"), notes.join("\n") + "\n"),
  };
}
