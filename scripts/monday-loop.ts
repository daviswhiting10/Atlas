/**
 * Smoke test of Monday's loop, on a production build, against dev-sessions, with throwaway users that are deleted afterwards.
 *
 *   coach creates a client with a plan (one exercise has no weight) -> invites her -> she sets a password (a simple one,
 *   through "Use it anyway") -> signs out -> signs in with email and password -> the plan is there -> she logs sets against
 *   per-set targets, reorders, finishes online, and again offline -> the coach's roster, Log session tab, client page,
 *   latest-session card and Week tab show it. A second client signs in with no plan and the coach assigns one afterwards.
 *
 * Dry run by default: it checks the setup (database is not production, the server answers) and lists the steps. Nothing is created.
 *
 *   npx next build && RESEND_API_KEY= AUTH_URL=http://localhost:3900 NEXTAUTH_URL=http://localhost:3900 AUTH_TRUST_HOST=true npx next start -p 3900
 *   npx tsx scripts/monday-loop.ts                # dry run
 *   npx tsx scripts/monday-loop.ts --run          # the real run (screenshots and report in ~/Documents/atlas-screenshots/monday-loop/<time>/)
 *   options: --base http://localhost:3900   --keep (leave the throwaway data in place)
 *
 * Database: the connection string is read from .env.local by this script and is never printed. The script refuses the
 * production database. Everything it creates sits in one workspace. The logins are @example.test addresses while it runs (a
 * @guest.atlas.app coach is the demo, which can't invite). At the end each login is renamed to a guest address and the
 * existing guest cleanup (lib/guest-cleanup.ts) removes the workspace; the script prints what was removed.
 * Passwords are random, held in memory, and never printed. (The one fixed string is the deliberately simple password.)
 */

import { randomBytes, randomUUID } from "crypto";
import { spawn, type ChildProcess } from "child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const RUN = args.includes("--run");
const KEEP = args.includes("--keep");
const BASE = (args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3900").replace(/\/$/, "");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = join(homedir(), "Documents", "atlas-screenshots", "monday-loop", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SIMPLE_PASSWORD = "lowercaseonlyletters"; // one kind of character: the warning, then "Use it anyway"

// ── The steps, in order (the dry run prints this list) ────────────────────────────────────────────────────────────────
const STEPS = [
  "setup: throwaway coach and workspace (database)",
  "coach signs in with a password",
  "coach adds a client (API) and builds her plan: one exercise has no weight, one has per-set targets",
  "coach invites her (the link comes back to the coach)",
  "client opens the invite link and continues",
  "client sets a simple password: warned, then Use it anyway",
  "client signs out",
  "client signs in with email and password",
  "client's Today shows the plan",
  "client logs session 1: per-set targets, one heavier set, reorders, finishes online",
  "client logs session 2: offline, finishes offline, reconnects, it saves",
  "client logs session 3: online, short",
  "coach roster row: Logged today, 3/4, Logs own",
  "coach Log session tab: the row opens the profile, Log -> opens the logger",
  "coach client page: the latest-session card",
  "coach client page: the Week tab",
  "late plan: a second client signs in with no plan, the coach assigns one, it appears",
  "cleanup: throwaway workspace deleted",
] as const;

type Result = { step: string; ok: boolean; ms: number; note: string; shot?: string };
const results: Result[] = [];

// ── A phone: headless Chrome at 390x844 with touch, driven over the DevTools protocol ───────────────────────────────
type Phone = Awaited<ReturnType<typeof openPhone>>;
async function openPhone(label: string) {
  const dir = mkdtempSync(join(tmpdir(), `monday-${label}-`));
  const port = 9300 + Math.floor(Math.random() * 600);
  const chrome: ChildProcess = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, "--user-data-dir=" + dir, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  type Target = { type: string; webSocketDebuggerUrl: string };
  let targets = null as Target[] | null;
  for (let i = 0; i < 60 && !targets; i++) {
    await sleep(500);
    try {
      targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as Target[];
    } catch {}
  }
  if (!targets) throw new Error("chrome did not start");
  const ws = new WebSocket(targets.find((t: Target) => t.type === "page")!.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map<number, (d: any) => void>();
  const errors: string[] = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(String(m.data));
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)!(d);
      pending.delete(d.id);
    }
    if (d.method === "Runtime.exceptionThrown") errors.push("EXC " + String(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 140));
  };
  const send = (method: string, params: object = {}) => new Promise<any>((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async <T = any>(expression: string): Promise<T> => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 240));
    return r.result?.result?.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: "portraitPrimary", angle: 0 } });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  const touch = (type: string, x: number, y: number) => send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  const rect = (sel: string, txt?: string) =>
    ev<{ x: number; y: number; w: number; h: number; label: string } | null>(`(()=>{const q=${JSON.stringify(sel)},tx=${JSON.stringify(txt ?? null)};let els=[...document.querySelectorAll(q)];if(tx)els=els.filter(e=>(e.innerText||e.getAttribute('aria-label')||'').trim().toLowerCase().includes(tx.toLowerCase()));els=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});if(!els.length)return null;const e=els[0];e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),w:Math.round(r.width),h:Math.round(r.height),label:(e.innerText||e.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ').slice(0,50)}})()`);
  let taps = 0;
  const api = {
    errors,
    taps: () => taps,
    resetTaps: () => (taps = 0),
    ev,
    send,
    rect,
    nav: async (path: string, wait = 2500) => { await send("Page.navigate", { url: path.startsWith("http") ? path : BASE + path }); await sleep(wait); },
    url: () => ev<string>("location.pathname+location.search"),
    text: (n = 800) => ev<string>(`document.body.innerText.replace(/\\n+/g,' / ').slice(0,${n})`),
    /** A real touch on the first visible element matching a selector (and text). */
    tap: async (sel: string, txt?: string, wait = 900) => {
      const r = await rect(sel, txt);
      if (!r) throw new Error(`nothing to tap: ${sel}${txt ? ` "${txt}"` : ""}`);
      taps++;
      await touch("touchStart", r.x, r.y);
      await sleep(50);
      await touch("touchEnd", 0, 0);
      await sleep(wait);
      return r;
    },
    /** Click through the page (for the logger's controls, which can sit off screen or be hidden until focused). */
    click: (sel: string, txt?: string) =>
      ev<boolean>(`(()=>{const tx=${JSON.stringify(txt ?? null)};let els=[...document.querySelectorAll(${JSON.stringify(sel)})];if(tx)els=els.filter(e=>(e.innerText||'').trim().toLowerCase().includes(tx.toLowerCase()));const e=els[0];if(!e)return false;e.click();return true})()`),
    /** Type into an input the way a keyboard does (React sees it). */
    type: async (sel: string, text: string) => {
      await ev(`document.querySelector(${JSON.stringify(sel)}).focus()`);
      await send("Input.insertText", { text });
      await sleep(150);
    },
    /** Wait until a page expression is true. Returns the ms it took, or throws. */
    until: async (js: string, maxMs = 15000, every = 150) => {
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        if (await ev<boolean>(`!!(${js})`).catch(() => false)) return Date.now() - t0;
        await sleep(every);
      }
      throw new Error(`timed out after ${maxMs} ms waiting for: ${js.slice(0, 90)}`);
    },
    offline: (on: boolean) => send("Network.emulateNetworkConditions", { offline: on, latency: 0, downloadThroughput: on ? 0 : -1, uploadThroughput: on ? 0 : -1 }),
    shot: async (name: string) => {
      const r = await send("Page.captureScreenshot", { format: "png" });
      const f = `${String(results.length + 1).padStart(2, "0")}-${label}-${name}.png`;
      writeFileSync(join(OUT, f), Buffer.from(r.result.data, "base64"));
      return f;
    },
    /** Sign in through the app's own sign-in endpoint (used for the throwaway coach only). */
    signInWith: (email: string, password: string) =>
      ev<boolean>(`(async()=>{const c=await fetch('/api/auth/csrf').then(r=>r.json());await fetch('/api/auth/callback/password',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:c.csrfToken,email:${JSON.stringify(email)},password:${JSON.stringify(password)},json:'true',callbackUrl:'/'})});const s=await fetch('/api/auth/session').then(r=>r.json());return !!(s&&s.user)})()`),
    close: () => { try { ws.close(); } catch {} chrome.kill(); },
  };
  return api;
}

// ── The run ───────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const { isProductionDatabase } = await import("@/lib/db/production");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (.env.local).");
  if (isProductionDatabase(process.env.DATABASE_URL)) throw new Error("Refusing to run: this is the production database.");

  const up = await fetch(BASE + "/login", { redirect: "manual" }).then((r) => r.status < 500, () => false);
  console.log(`Monday loop · ${RUN ? "RUN" : "DRY RUN"} · server ${BASE} ${up ? "answers" : "is NOT answering"} · database is not production`);
  if (!RUN) {
    STEPS.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s}`));
    console.log("\nDry run: nothing was created. Add --run to do it for real.");
    return;
  }
  if (!up) throw new Error(`Nothing answers at ${BASE}. Start a production build there first (see the top of this file).`);
  mkdirSync(OUT, { recursive: true });

  const { prisma } = await import("@/lib/db/client");
  const { hashPassword } = await import("@/lib/password");
  const { GUEST_EMAIL_DOMAIN } = await import("@/lib/auth/route-policy");
  const { upsertProgram, assignProgram } = await import("@/lib/db/programs");
  const { resolveExercise } = await import("@/lib/programs/resolve-exercise");
  const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");

  const tag = randomUUID().slice(0, 8);
  const coachEmail = `monday-coach-${tag}@example.test`;
  const coachPassword = randomBytes(18).toString("base64url");
  const clientEmail = `monday-client-${tag}@example.test`;
  const lateEmail = `monday-late-${tag}@example.test`;
  const clientPassword = SIMPLE_PASSWORD;
  const latePassword = randomBytes(18).toString("base64url");
  let workspaceId = "";
  let clientId = "";
  let lateId = "";
  let inviteLink = "";
  const phones: Phone[] = [];
  const open = async (label: string) => { const p = await openPhone(label); phones.push(p); return p; };

  async function step(name: string, fn: () => Promise<string | void>, shot?: () => Promise<string>) {
    const t0 = Date.now();
    let ok = true;
    let note = "";
    try {
      note = (await fn()) ?? "";
    } catch (e) {
      ok = false;
      note = String((e as Error).message ?? e).replace(/postgres(ql)?:\/\/\S+/gi, "[url]").slice(0, 300);
    }
    let file: string | undefined;
    if (shot) file = await shot().catch(() => undefined);
    const r: Result = { step: name, ok, ms: Date.now() - t0, note, shot: file };
    results.push(r);
    console.log(`${ok ? "PASS" : "FAIL"}  ${String(r.ms).padStart(6)} ms  ${name}${note ? `  — ${note}` : ""}`);
    return ok;
  }
  const must = async (name: string, fn: () => Promise<string | void>, shot?: () => Promise<string>) => {
    if (!(await step(name, fn, shot))) throw new Error(`stopped: "${name}" failed`);
  };

  const coach = await open("coach");
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const startDate = new Date(day.getTime() - 3 * 86_400_000);

  /** A plan of four workouts in the plan's first week; the first exercise has per-set targets, the second has no weight. */
  async function buildPlan(forClientId: string, name: string) {
    const ids = {
      bench: (await resolveExercise("Bench Press", workspaceId)).id,
      pushup: (await resolveExercise("Push-Up", workspaceId)).id,
      squat: (await resolveExercise("Goblet Squat", workspaceId)).id,
    };
    const set = (n: number, weight: number | null, min: number, max: number) => ({ setNumber: n, weight, unit: "reps" as const, repMin: min, repMax: max, rpe: null, restSeconds: null, notes: "" });
    const workout = (n: string, d: number, order: number) => ({
      name: n,
      dayOfWeek: d,
      order,
      exercises: [
        { exerciseId: ids.bench, order: 1, prescribedSets: [set(1, 95, 8, 10), set(2, 105, 8, 10), set(3, 115, 8, 10)] }, // per-set targets
        { exerciseId: ids.pushup, order: 2, prescribedSets: [set(1, null, 10, 15), set(2, null, 10, 15)] }, // no weight
        { exerciseId: ids.squat, order: 3, prescribedSets: [set(1, 40, 10, 12), set(2, 40, 10, 12)] },
      ],
    });
    const program = await upsertProgram(workspaceId, {
      name,
      description: null,
      goalTags: { goals: [], conditions: [] },
      blocks: [{ name: "Week 1", order: 1, weeks: 1, workouts: [workout("Upper A", 1, 1), workout("Lower A", 2, 2), workout("Upper B", 3, 3), workout("Lower B", 4, 4)] }],
    });
    const a = await assignProgram(workspaceId, program.id, forClientId, startDate);
    await prisma.programAssignment.update({ where: { id: a.id }, data: { status: "ACTIVE" } });
    // The four workouts fall on the plan's first four days, the last of them today.
    const aws = await prisma.assignedWorkout.findMany({ where: { programAssignmentId: a.id }, orderBy: { scheduledDate: "asc" }, select: { id: true } });
    for (let i = 0; i < aws.length; i++) await prisma.assignedWorkout.update({ where: { id: aws[i].id }, data: { scheduledDate: new Date(startDate.getTime() + i * 86_400_000), status: "PLANNED" } });
    return aws.length;
  }

  /** Sign a client in from an invite link and get her to Today (optionally through a password). */
  async function openInvite(phone: Phone, link: string) {
    await phone.nav(link, 3500);
    await phone.tap("button", "Continue", 3500);
  }

  /** Log one plan session on the phone. `all` ticks every set; otherwise one set. Returns notes. */
  async function logSession(phone: Phone, opts: { all: boolean; reorder?: boolean; heavier?: boolean }) {
    await phone.nav("/today", 3000);
    await phone.tap("a", "Start", 3500);
    await phone.until(`location.pathname.startsWith('/workouts/') && document.body.innerText.includes('Delete set')`, 20000);
    const notes: string[] = [];
    if (opts.reorder) {
      const before = await phone.ev<string>(`[...document.querySelectorAll('[aria-label^="Open "],[aria-label^="More for "]')].map(e=>e.getAttribute('aria-label')).join('|')`);
      const moved = await phone.click("button", "Move Bench Press down");
      await sleep(900);
      const after = await phone.ev<string>(`[...document.querySelectorAll('[aria-label^="Open "],[aria-label^="More for "]')].map(e=>e.getAttribute('aria-label')).join('|')`);
      notes.push(moved && before !== after ? "reordered" : `reorder did not change the order (${moved ? "clicked" : "no Move button"})`);
    }
    // Work through every exercise: tick what is open, then open the next folded one.
    for (let round = 0; round < 8; round++) {
      const ticks = await phone.ev<number>(`document.querySelectorAll('[aria-label^="Mark set"]').length`);
      for (let k = 0; k < ticks; k++) {
        if (opts.heavier && (await phone.ev<boolean>(`!!document.querySelector('[aria-label="Mark set 3 done"]') && !!document.querySelector('[aria-label="Increase Set 3 weight"]')`))) {
          await phone.click('[aria-label="Increase Set 3 weight"]');
          await sleep(250);
          opts = { ...opts, heavier: false };
        }
        await phone.click('[aria-label^="Mark set"]');
        await sleep(1100);
        if (!opts.all) return [...notes, "one set"];
      }
      const opened = await phone.click('[aria-label^="Open "]');
      if (!opened) break;
      await sleep(700);
    }
    return notes;
  }

  /**
   * Finish is a button in the logger header (ux-finish-early). With sets left unticked it asks "Finish now?" first.
   * With every set ticked the logger finishes by itself; offline, that finish is queued and the header button is hidden
   * ("Finishes when you're back"), so there is nothing to tap and the caller checks that it saves.
   */
  async function finish(phone: Phone) {
    const tapped = await phone.ev<boolean>(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Finish'&&!b.closest('[role=dialog]'));if(!b||b.disabled)return false;b.click();return true})()`);
    if (!tapped) {
      if (await phone.ev<boolean>(`/Finishes when you're back|All sets logged · finishing|, done\\./.test(document.body.innerText)`)) return;
      throw new Error("no Finish button in the logger header");
    }
    await sleep(700);
    await phone.ev(`(()=>{const b=[...document.querySelectorAll('[role=dialog][aria-label="Finish now?"] button')].find(b=>b.innerText.trim()==='Finish');if(b)b.click()})()`);
  }

  const dbDone = (cid: string) => prisma.workoutLog.count({ where: { clientId: cid, completedAt: { not: null } } });

  try {
    await must(STEPS[0], async () => {
      const ws = await prisma.workspace.create({ data: { name: `Monday loop (throwaway ${tag})` }, select: { id: true } });
      workspaceId = ws.id;
      const user = await prisma.user.create({ data: { name: "Monday coach", email: coachEmail, passwordHash: await hashPassword(coachPassword), role: "TRAINER", workspaceId, emailVerified: new Date() }, select: { id: true } });
      await prisma.trainerProfile.create({ data: { userId: user.id } });
      return "workspace + coach created";
    });

    await must(STEPS[1], async () => {
      await coach.nav("/login", 2500);
      if (!(await coach.signInWith(coachEmail, coachPassword))) throw new Error("sign-in did not give a session");
      await coach.nav("/clients", 3000);
      const u = await coach.url();
      if (!u.startsWith("/clients")) throw new Error(`landed on ${u}`);
    }, () => coach.shot("roster-empty"));

    await must(STEPS[2], async () => {
      const made = await coach.ev<{ id?: string; error?: unknown }>(`fetch('/api/clients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fullName:'Monday Loop Client',email:${JSON.stringify(clientEmail)},status:'ACTIVE'})}).then(r=>r.json())`);
      if (!made.id) throw new Error("client was not created: " + JSON.stringify(made.error ?? made).slice(0, 120));
      clientId = made.id;
      const n = await buildPlan(clientId, `Monday loop plan ${tag}`);
      return `${n} workouts planned`;
    });

    await must(STEPS[3], async () => {
      const r = await coach.ev<{ ok?: boolean; link?: string; error?: string }>(`fetch('/api/clients/${clientId}/invite',{method:'POST'}).then(r=>r.json())`);
      if (!r.link) throw new Error("no link came back: " + (r.error ?? "unknown"));
      inviteLink = r.link;
      return "link returned (not printed)";
    });

    const client = await open("client");
    await must(STEPS[4], async () => {
      await openInvite(client, inviteLink);
      const u = await client.url();
      if (!/set-password|today|^\/$/.test(u)) throw new Error(`landed on ${u}`);
      return `landed on ${u}`;
    }, () => client.shot("after-invite"));

    await must(STEPS[5], async () => {
      if (!(await client.url()).includes("set-password")) throw new Error("the set-password step did not appear: " + (await client.url()));
      await client.type('input[type="password"]', clientPassword);
      await client.tap("button", "Save password", 1500);
      const warned = await client.ev<boolean>(`/easy to guess/i.test(document.body.innerText) && !![...document.querySelectorAll('button')].find(b=>/Use it anyway/.test(b.innerText))`);
      if (!warned) throw new Error("no 'This looks easy to guess' warning with Use it anyway");
      await client.shot("password-warning");
      await client.tap("button", "Use it anyway", 3500);
      const u = await client.url();
      if (u.includes("set-password")) throw new Error("still on the set-password step");
      const stored = await prisma.user.findUnique({ where: { email: clientEmail }, select: { passwordHash: true } });
      if (!stored?.passwordHash) throw new Error("no password was stored");
      return "warned, then saved";
    }, () => client.shot("after-set-password"));

    await must(STEPS[6], async () => {
      await client.ev(`(async()=>{const c=await fetch('/api/auth/csrf').then(r=>r.json());await fetch('/api/auth/signout',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:c.csrfToken,json:'true'})})})()`);
      await client.nav("/today", 2500);
      const u = await client.url();
      if (!u.startsWith("/login")) throw new Error(`still signed in (${u})`);
    });

    await must(STEPS[7], async () => {
      await client.nav("/login", 2500);
      await client.type('input[type="email"]', clientEmail);
      await client.type('input[type="password"]', clientPassword);
      const t0 = Date.now();
      await client.tap("button[type=submit]", undefined, 500);
      await client.until(`location.pathname==='/today' || location.pathname==='/'`, 20000);
      return `signed in in ${Date.now() - t0} ms`;
    }, () => client.shot("signed-in"));

    await must(STEPS[8], async () => {
      await client.nav("/today", 3000);
      const t = await client.text(400);
      if (!/Upper A|Lower A|Start/.test(t)) throw new Error("no plan on Today: " + t.slice(0, 120));
      return t.slice(0, 90);
    }, () => client.shot("today-with-plan"));

    await must(STEPS[9], async () => {
      const n = await logSession(client, { all: true, reorder: true, heavier: true });
      await client.shot("logger-all-set");
      await finish(client);
      await client.until(`/, done\\./.test(document.body.innerText)`, 30000);
      const done = await dbDone(clientId);
      if (done !== 1) throw new Error(`expected 1 finished session, found ${done}`);
      // What was stored: every set of the plan, the third bench set heavier than its own target (115), the unweighted exercise without a weight.
      const sets = await prisma.setLog.findMany({ where: { workoutLog: { clientId } }, select: { setNumber: true, weight: true, completed: true, exercise: { select: { name: true } } }, orderBy: [{ exerciseId: "asc" }, { setNumber: "asc" }] });
      const bench = sets.filter((x) => x.exercise?.name === "Bench Press").sort((a, b) => a.setNumber - b.setNumber);
      const push = sets.filter((x) => x.exercise?.name === "Push-Up");
      if (sets.length !== 7 || !sets.every((x) => x.completed)) throw new Error(`expected 7 completed sets, found ${sets.length}`);
      if (bench.length !== 3 || !(bench[2].weight! > 115) || bench[0].weight !== 95) throw new Error(`bench weights ${bench.map((x) => x.weight).join("/")}: expected 95/105/>115`);
      if (push.some((x) => x.weight != null && x.weight > 0)) throw new Error("the unweighted exercise was given a weight");
      n.push(`bench ${bench.map((x) => x.weight).join("/")}`, "7 sets stored");
      return n.join("; ") || "ok";
    }, () => client.shot("done-screen"));

    await must(STEPS[10], async () => {
      await client.nav("/today", 3000);
      await client.tap("a", "Start", 3500);
      await client.until(`location.pathname.startsWith('/workouts/') && document.body.innerText.includes('Delete set')`, 20000);
      await client.offline(true);
      await sleep(600);
      let ticked = 0;
      for (let round = 0; round < 8; round++) {
        const ticks = await client.ev<number>(`document.querySelectorAll('[aria-label^="Mark set"]').length`);
        for (let k = 0; k < ticks; k++) { await client.click('[aria-label^="Mark set"]'); ticked++; await sleep(500); }
        if (!(await client.click('[aria-label^="Open "]'))) break;
        await sleep(600);
      }
      await client.shot("offline-sets");
      await finish(client);
      await sleep(6000);
      const whileOffline = await dbDone(clientId);
      await client.offline(false);
      await client.send("Page.bringToFront");
      await client.ev(`window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'))`);
      const t0 = Date.now();
      let after = whileOffline;
      while (Date.now() - t0 < 60000 && after < 2) { await sleep(1000); after = await dbDone(clientId); }
      if (after < 2) throw new Error(`the offline session did not save within 60 s of reconnecting (${ticked} sets ticked)`);
      const stored = await prisma.setLog.count({ where: { workoutLog: { clientId, completedAt: { not: null } } } });
      return `${ticked} sets ticked offline; ${whileOffline < 2 ? "not saved while offline" : "already saved while offline"}; saved ${Math.round((Date.now() - t0) / 1000)} s after reconnecting; ${stored} sets stored in all`;
    }, () => client.shot("after-reconnect"));

    await must(STEPS[11], async () => {
      await logSession(client, { all: false });
      await finish(client);
      await client.until(`/, done\\./.test(document.body.innerText)`, 30000);
      const done = await dbDone(clientId);
      if (done !== 3) throw new Error(`expected 3 finished sessions, found ${done}`);
    });

    await must(STEPS[12], async () => {
      coach.resetTaps();
      await coach.nav("/clients", 3500);
      const row = await coach.ev<string>(`(()=>{const a=document.querySelector('a[href="/clients/${clientId}"]');return a?a.innerText.replace(/\\n+/g,' | '):''})()`);
      const miss = ["Logged today", "3/4", "Logs own"].filter((s) => !row.includes(s));
      if (miss.length) throw new Error(`row reads "${row.slice(0, 120)}", missing: ${miss.join(", ")}`);
      return row;
    }, () => coach.shot("roster-row"));

    await must(STEPS[13], async () => {
      await coach.nav("/log", 3500);
      coach.resetTaps();
      await coach.tap(`a[href="/clients/${clientId}"]`, undefined, 2500);
      const u1 = await coach.url();
      if (u1 !== `/clients/${clientId}`) throw new Error(`the row went to ${u1}, not the profile`);
      await coach.nav("/log", 3500);
      const r = await coach.rect(`a[href="/clients/${clientId}/log"]`);
      if (!r || r.h < 44) throw new Error(`Log -> button missing or under 44 px (${r?.h ?? "none"})`);
      await coach.tap(`a[href="/clients/${clientId}/log"]`, undefined, 2500);
      const u2 = await coach.url();
      if (u2 !== `/clients/${clientId}/log`) throw new Error(`Log -> went to ${u2}`);
      return `row -> profile; Log -> logger (${r.w}x${r.h})`;
    }, () => coach.shot("log-tab-then-logger"));

    await must(STEPS[14], async () => {
      await coach.nav(`/clients/${clientId}`, 4000);
      const card = await coach.ev<string>(`(()=>{const s=document.querySelector('section[aria-label="Latest session"]');return s?s.innerText.replace(/\\n+/g,' | '):''})()`);
      if (!card) throw new Error("no Latest session card");
      // She finished it from her own Finish button. The marker shows only for sessions finished on or after the day the
      // loggedBy fix ships (lib/coach/finished-by.ts); before that day it must not show at all.
      const { FINISHED_BY_RELIABLE_FROM } = await import("@/lib/coach/finished-by");
      const expectMarks = Date.now() >= FINISHED_BY_RELIABLE_FROM.getTime();
      if (expectMarks !== /Finished by client/.test(card)) throw new Error(`"Finished by client" ${expectMarks ? "missing" : "shown before the cut-off"}: ${card.slice(0, 120)}`);
      await coach.ev(`(()=>{const t=[...document.querySelectorAll('[role=tab],[role=tablist] button')].find(e=>/^Sessions/.test((e.innerText||'').trim()));if(t)t.click()})()`);
      await sleep(1500);
      const listed = await coach.ev<number>(`(document.body.innerText.match(/Finished by client/g)||[]).length`);
      if (expectMarks ? listed < 3 : listed !== 0) throw new Error(`Sessions list shows the marker ${listed} times, expected ${expectMarks ? 3 : 0}`);
      await coach.nav(`/clients/${clientId}`, 3000); // back to the first tab for the Week step
      return `${card.slice(0, 120)} | list marks: ${listed} (cut-off ${FINISHED_BY_RELIABLE_FROM.toISOString().slice(0, 10)}, ${expectMarks ? "after" : "before"})`;
    }, () => coach.shot("client-latest-session"));

    await must(STEPS[15], async () => {
      const first = await coach.ev<string>(`(document.querySelector('[role=tablist] [role=tab],[role=tablist] button')||{}).innerText||''`);
      if (!/Week/.test(first)) throw new Error(`first tab is "${first}"`);
      const week = await coach.ev<string>(`(()=>{const s=document.querySelector('section[aria-label="This week"]');return s?s.innerText.replace(/\\n+/g,' '):''})()`);
      if (!/3\s*\/\s*4/.test(week)) throw new Error(`Week reads "${week.slice(0, 100)}"`);
      return week.slice(0, 100);
    }, () => coach.shot("client-week-tab"));

    // The late plan: she is signed in before any plan exists.
    await must(STEPS[16], async () => {
      const made = await coach.ev<{ id?: string }>(`fetch('/api/clients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fullName:'Monday Late Client',email:${JSON.stringify(lateEmail)},status:'ACTIVE'})}).then(r=>r.json())`);
      if (!made.id) throw new Error("late client not created");
      lateId = made.id;
      const inv = await coach.ev<{ link?: string }>(`fetch('/api/clients/${lateId}/invite',{method:'POST'}).then(r=>r.json())`);
      if (!inv.link) throw new Error("no invite link");
      const late = await open("late");
      await openInvite(late, inv.link);
      if ((await late.url()).includes("set-password")) {
        await late.type('input[type="password"]', latePassword);
        await late.tap("button", "Save password", 3500);
      }
      await late.nav("/today", 3000);
      const before = await late.text(300);
      if (/Start/.test(before)) throw new Error("she already has a plan before it was assigned");
      await buildPlan(lateId, `Monday loop late plan ${tag}`);
      const t0 = Date.now();
      // She switches back to the app: no tap, no reload.
      await late.ev(`window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))`);
      let how = "";
      try {
        await late.until(`/Upper A|Lower A|Upper B|Lower B/.test(document.body.innerText)`, 25000, 500);
        how = `appeared ${Math.round((Date.now() - t0) / 100) / 10} s after she came back to the app`;
      } catch {
        await late.nav("/today", 3000);
        if (!/Upper A|Lower A|Upper B|Lower B/.test(await late.text(400))) throw new Error("the plan is not on Today even after a reload");
        how = "appeared only after a reload (it did not show on its own within 25 s)";
      }
      await late.shot("late-plan-today");
      return how;
    });
  } catch (e) {
    console.log(String((e as Error).message));
  } finally {
    for (const p of phones) p.close();
    if (workspaceId && !KEEP) {
      await step(STEPS[17], async () => {
        // A guest-domain coach is the demo (no invites), so the logins use example.test while the test runs. Cleanup then
        // gives each login a guest address, which is exactly what the existing guest cleanup needs to accept the workspace.
        for (const u of await prisma.user.findMany({ where: { workspaceId }, select: { id: true } })) await prisma.user.update({ where: { id: u.id }, data: { email: `cleanup-${u.id}@${GUEST_EMAIL_DOMAIN}` } });
        const res = await deleteGuestWorkspace(workspaceId, { ttlMs: 0, includeAthletes: true });
        const left = await prisma.user.count({ where: { email: { in: [coachEmail, clientEmail, lateEmail] } } });
        const wsLeft = await prisma.workspace.count({ where: { id: workspaceId } });
        if (left || wsLeft) throw new Error(`${left} users and ${wsLeft} workspaces are still there`);
        const total = Object.values(res.deleted).reduce((a, b) => a + b, 0);
        return `removed ${total} rows in ${Object.keys(res.deleted).length} tables; users 3 -> 0`;
      });
    } else if (KEEP) {
      console.log(`--keep: throwaway workspace ${workspaceId} left in place`);
    }
    await prisma.$disconnect().catch(() => {});

    const failed = results.filter((r) => !r.ok);
    const md = [
      `# Monday loop — ${failed.length === 0 ? "all steps passed" : `${failed.length} step(s) failed`}`,
      "",
      `Server ${BASE} (production build), dev-sessions, 390x844. ${new Date().toISOString()}`,
      "",
      "| # | Step | Result | ms | Note | Screenshot |",
      "|---|------|--------|----|------|------------|",
      ...results.map((r, i) => `| ${i + 1} | ${r.step} | ${r.ok ? "PASS" : "FAIL"} | ${r.ms} | ${r.note.replace(/\|/g, "/")} | ${r.shot ?? ""} |`),
    ].join("\n");
    writeFileSync(join(OUT, "report.md"), md + "\n");
    console.log(`\n${failed.length === 0 ? "ALL PASSED" : failed.length + " FAILED"} · report and screenshots: ${OUT}`);
    process.exitCode = failed.length ? 1 : 0;
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error(String((e as Error).message ?? e).replace(/postgres(ql)?:\/\/\S+/gi, "[url]"));
    process.exit(1);
  }
);
