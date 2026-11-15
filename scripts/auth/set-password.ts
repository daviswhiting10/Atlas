/**
 * Break glass: set an account's password from the terminal, for when nobody
 * can sign in (the email link isn't arriving, the app is misbehaving).
 *
 *   npx tsx scripts/auth/set-password.ts <email>                      # DATABASE_URL, else .env.local (dev-sessions)
 *   ALLOW_PROD=1 npx tsx scripts/auth/set-password.ts --prod <email>  # production, from .env.prod-db.local
 *
 * The password is typed at a hidden prompt on the terminal, never passed as
 * an argument or read from a pipe, so it stays out of shell history and logs.
 * Run it yourself in a terminal (in Claude Code: `! <command>`), never through
 * an agent.
 *
 * It writes passwordChangedAt, so every existing session for the account is
 * signed out at its next check, and it cancels unused reset links. Refuses
 * production unless ALLOW_PROD=1.
 */

import { openSync, closeSync } from "fs";
import { ReadStream, WriteStream } from "tty";
import { config } from "dotenv";
import { maskEmail as mask } from "@/lib/auth/mask";

const args = process.argv.slice(2);
const prod = args.includes("--prod");
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!email || !email.includes("@")) fail("Usage: npx tsx scripts/auth/set-password.ts [--prod] <email>");

if (prod) {
  const env: Record<string, string> = {};
  config({ path: ".env.prod-db.local", processEnv: env, quiet: true });
  if (!env.PROD_DATABASE_URL) fail("--prod needs PROD_DATABASE_URL in .env.prod-db.local.");
  process.env.DATABASE_URL = env.PROD_DATABASE_URL;
}
// Everything else (and DATABASE_URL when not given) from .env.local, without overriding what's set.
config({ path: ".env.local", quiet: true });

/** Ask on the terminal itself, without echoing what's typed. */
function ask(tty: { input: ReadStream; output: WriteStream }, question: string, hidden: boolean): Promise<string> {
  const { input, output } = tty;
  output.write(question);
  return new Promise((resolve, reject) => {
    let value = "";
    input.setRawMode(true);
    input.resume();
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          output.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") {
          input.setRawMode(false);
          output.write("\n");
          return reject(new Error("Cancelled."));
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value) {
            value = value.slice(0, -1);
            if (!hidden) output.write("\b \b");
          }
          continue;
        }
        value += ch;
        if (!hidden) output.write(ch);
      }
    };
    input.on("data", onData);
  });
}

async function main() {
  const { isProductionDatabase } = await import("@/lib/db/production");
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set (and not in .env.local).");
  const isProd = isProductionDatabase(url);
  if (isProd && process.env.ALLOW_PROD !== "1") fail("That is production: refusing to run without ALLOW_PROD=1.");

  let fd: number;
  try {
    fd = openSync("/dev/tty", "r+");
  } catch {
    fail("No terminal to ask on. Run this yourself in a terminal window; the password is typed at a hidden prompt.");
  }
  const tty = { input: new ReadStream(fd), output: new WriteStream(fd) };

  const { prisma } = await import("@/lib/db/client");
  const { hashPassword, passwordProblem } = await import("@/lib/password");
  const { GUEST_EMAIL_DOMAIN } = await import("@/lib/guest");
  const { clear, throttleKey } = await import("@/lib/auth/throttle");

  try {
    const target = `${new URL(url).hostname.split(".")[0].replace(/-pooler$/, "")}${isProd ? " (PRODUCTION)" : ""}`;
    if (email!.endsWith(`@${GUEST_EMAIL_DOMAIN}`)) fail("That's a guest account; guests have no password.");
    const user = await prisma.user.findUnique({ where: { email: email! }, select: { id: true, role: true } });
    if (!user) fail(`No account for ${mask(email!)} on ${target}.`);

    tty.output.write(`Account ${mask(email!)} (${user.role}) on ${target}.\n`);
    const ok = await ask(tty, isProd ? 'Type "production" to go on: ' : "Go on? [y/N] ", false);
    if (isProd ? ok !== "production" : !/^y(es)?$/i.test(ok)) fail("Nothing changed.");

    const password = await ask(tty, "New password (hidden): ", true);
    const problem = passwordProblem(password, email);
    if (problem) fail(`${problem} Nothing changed.`);
    if ((await ask(tty, "Again (hidden): ", true)) !== password) fail("The two didn't match. Nothing changed.");

    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date(), passwordPromptAfter: null } }),
      prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } }),
    ]);
    // Sign-in limits for the address (only found if this AUTH_SECRET matches the server's; they expire on their own within 15 minutes anyway).
    await clear(throttleKey("signinEmail", email!));
    console.log(`Password set for ${mask(email!)} on ${target}. Its other sessions are signed out at their next check (within 10 minutes).`);
  } finally {
    closeSync(fd);
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
