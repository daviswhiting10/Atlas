/**
 * Remove expired demo workspaces (a guest coach's, older than 6 hours; try-it guest athletes are never selected) (see lib/guest-cleanup.ts), by hand.
 *
 *   npx tsx scripts/demo-cleanup.ts                 dry run: lists what would be deleted, with exact counts (the delete runs and is rolled back)
 *   npx tsx scripts/demo-cleanup.ts --apply         really delete
 *   --hours <n>   age threshold in hours (default 6)
 *   --limit <n>   at most this many workspaces (default all)
 *
 * Before and after, it counts every table's rows for every workspace, and the
 * shared (workspace-less) exercise rows. Every workspace that wasn't deleted
 * must match exactly; if one doesn't, it exits with an error.
 *
 * Refuses production unless ALLOW_PROD=1. Never prints emails or names.
 */
import { prisma } from "@/lib/db/client";
import { isProductionDatabase } from "@/lib/db/production";
import { COVERED_TABLES, deleteGuestWorkspace, findExpiredGuestWorkspaces, type Counts } from "@/lib/guest-cleanup";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const apply = process.argv.includes("--apply");
const hours = Number(arg("--hours") ?? 6);
const limit = Number(arg("--limit") ?? 100000);
if (isProductionDatabase(process.env.DATABASE_URL) && process.env.ALLOW_PROD !== "1") throw new Error("That is production — refusing to run without ALLOW_PROD=1");

/** How to find a table's workspace: a column on the table, or a join. */
const VIA: Record<string, string> = {
  SetLog: `join "WorkoutLog" w on w.id=x."workoutLogId" join "ClientProfile" c on c.id=w."clientId"`,
  WorkoutLog: `join "ClientProfile" c on c.id=x."clientId"`,
  SessionNote: `join "ClientProfile" c on c.id=x."clientId"`,
  Assessment: `join "ClientProfile" c on c.id=x."clientId"`,
  IntakeForm: `join "ClientProfile" c on c.id=x."clientId"`,
  NutritionEntry: `join "ClientProfile" c on c.id=x."clientId"`,
  ProgressPhoto: `join "ClientProfile" c on c.id=x."clientId"`,
  GoalCheckIn: `join "Goal" c on c.id=x."goalId"`,
  Message: `join "Conversation" c on c.id=x."conversationId"`,
  TrainerProfile: `join "User" c on c.id=x."userId"`,
  Account: `join "User" c on c.id=x."userId"`,
  Session: `join "User" c on c.id=x."userId"`,
  PasswordReset: `join "User" c on c.id=x."userId"`,
};

/** "workspaceId|Table" -> rows, for every workspace, plus the shared exercise rows. */
async function snapshot(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const t of COVERED_TABLES) {
    const sql = t === "Workspace" ? `select id as w, 1::int as n from "Workspace"` : VIA[t] ? `select c."workspaceId" as w, count(*)::int as n from "${t}" x ${VIA[t]} group by 1` : `select x."workspaceId" as w, count(*)::int as n from "${t}" x group by 1`;
    for (const r of await prisma.$queryRawUnsafe<{ w: string | null; n: number }[]>(sql)) out.set(`${r.w ?? "(shared)"}|${t}`, r.n);
  }
  return out;
}

const kindOf = (users: Array<{ role: string }>, name: string) => (name.endsWith(" — demo") ? "demo (coach)" : users.some((u) => u.role === "TRAINER") ? "guest coach" : "try-it athlete");

async function main() {
  const host = new URL(process.env.DATABASE_URL!).hostname.replace(/^(ep-[a-z]+-[a-z]+)-.*$/, "$1…");
  console.log(`${apply ? "APPLY" : "DRY RUN"} on ${host}; demo workspaces older than ${hours} h whose every user is a guest login\n`);

  const before = await snapshot();
  const now = new Date();
  const found = await findExpiredGuestWorkspaces(limit, now, hours * 3_600_000);
  const names = new Map((await prisma.workspace.findMany({ where: { id: { in: found.map((f) => f.id) } }, select: { id: true, name: true } })).map((w) => [w.id, w.name]));

  console.log("Selected (oldest first):");
  const totals: Counts = {};
  const kinds: Record<string, number> = {};
  for (const w of found) {
    const kind = kindOf(w.users, names.get(w.id) ?? "");
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    const t0 = Date.now();
    const r = await deleteGuestWorkspace(w.id, { dryRun: !apply, now, ttlMs: hours * 3_600_000 });
    const rows = Object.values(r.deleted).reduce((a, b) => a + b, 0);
    for (const [t, n] of Object.entries(r.deleted)) totals[t] = (totals[t] ?? 0) + n;
    console.log(`  ${w.id.slice(0, 8)}…  ${w.createdAt.toISOString().slice(0, 16)}  ${String(Math.round((now.getTime() - w.createdAt.getTime()) / 3_600_000)).padStart(3)} h  ${kind.padEnd(14)} users: ${w.users.length}  rows: ${rows}  ${Date.now() - t0} ms`);
  }
  console.log(`\n${apply ? "Deleted" : "Would delete"}: ${found.length} workspaces (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ") || "none"})`);
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log(`${sum} rows:`);
  for (const [t, n] of Object.entries(totals).sort((a, b) => b[1] - a[1])) if (n) console.log(`  ${t.padEnd(24)} ${n}`);

  // Every workspace not selected must be exactly as it was; the selected ones are gone (apply) or untouched (dry run).
  const after = await snapshot();
  const gone = new Set(found.map((f) => f.id));
  const bad: string[] = [];
  for (const [k, n] of Array.from(before)) {
    const ws = k.split("|")[0];
    if (gone.has(ws) && apply) continue;
    if ((after.get(k) ?? 0) !== n) bad.push(`${k.replace(/^(.{8})[^|]*/, "$1…")}: ${n} -> ${after.get(k) ?? 0}`);
  }
  for (const [k, n] of Array.from(after)) if (!before.has(k) && !(gone.has(k.split("|")[0]) && apply) && n !== 0) bad.push(`${k.replace(/^(.{8})[^|]*/, "$1…")}: new ${n}`);
  if (apply) for (const id of Array.from(gone)) if (Array.from(after.keys()).some((k) => k.startsWith(id + "|"))) bad.push(`${id.slice(0, 8)}…: still has rows`);

  const sumFor = (m: Map<string, number>, ws: string) => Array.from(m).reduce((a, [k, n]) => (k.startsWith(ws + "|") ? a + n : a), 0);
  const kept = Array.from(new Set(Array.from(before.keys()).map((k) => k.split("|")[0]).filter((w) => !gone.has(w))));
  console.log(`\nKept workspaces (rows before -> after, all tables):`);
  for (const w of kept) console.log(`  ${w === "(shared)" ? "(shared exercises)" : w.slice(0, 8) + "…"}  ${sumFor(before, w)} -> ${sumFor(after, w)}`);
  console.log(`\nVerification: ${kept.length} workspaces kept; ${before.size} per-table counts compared before, ${after.size} after.`);
  if (bad.length) {
    console.log(`MISMATCH (${bad.length}):\n  ${bad.slice(0, 20).join("\n  ")}`);
    process.exitCode = 1;
  } else console.log(apply ? "PASS: every kept workspace has identical row counts in every table; the deleted ones have none left." : "PASS: the dry run changed nothing (all counts identical).");
}

main().finally(() => prisma.$disconnect());
