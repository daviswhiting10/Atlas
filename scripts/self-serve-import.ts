/**
 * The self-serve empty Today, end to end on a production build against dev-sessions, with throwaway users that are
 * deleted afterwards: a new athlete with no plan -> Import -> a real multi-week PDF -> checked -> saved -> Today shows
 * the first workout with Start. Counts taps and seconds at 390x844 (real touches). Also checks that a coached client and
 * a guest are refused, and that the daily limit on reads holds.
 *
 *   npx next build && RESEND_API_KEY= AUTH_URL=http://localhost:3900 NEXTAUTH_URL=http://localhost:3900 AUTH_TRUST_HOST=true npx next start -p 3900
 *   npx tsx scripts/self-serve-import.ts --run [--pdf path.pdf] [--base http://localhost:3900]
 *
 * Dry run without --run. Reading the PDF is one real AI call (a few cents). The database string is read from .env.local
 * and never printed; the script refuses production.
 */
import { randomBytes, randomUUID } from "crypto";
import { spawn, type ChildProcess } from "child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join, resolve } from "path";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const args = process.argv.slice(2);
const RUN = args.includes("--run");
/** Leave out the file import (the one step that costs an AI call). */
const SKIP_IMPORT = args.includes("--skip-import");
/** Only the importers beyond Today (You, a client's Plan tab, the library): three AI reads instead of four. */
const ONLY_OTHERS = args.includes("--only-other-importers");
const arg = (n: string, d: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const BASE = arg("--base", "http://localhost:3900").replace(/\/$/, "");
const DIR = join(homedir(), "Documents/atlas-screenshots/self-serve");
const PDF = resolve(arg("--pdf", join(DIR, "strength-base-4wk.pdf")));
/** The default PDF's heavier week 3 and deload week 4, for the bench press: what must be saved, week by week. */
const BENCH_WEEKS = PDF.endsWith("strength-base-4wk.pdf") ? ["3x8-10@135", "3x8-10@140", "4x6-8@155", "2x8-10@115"] : null;
const TOO_BIG = join(DIR, "too-big-6mb.pdf");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = join(homedir(), "Documents", "atlas-screenshots", "self-serve", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Phone = Awaited<ReturnType<typeof openPhone>>;
async function openPhone(label: string) {
  const dir = mkdtempSync(join(tmpdir(), `selfserve-${label}-`));
  const port = 9300 + Math.floor(Math.random() * 600);
  const chrome: ChildProcess = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, "--user-data-dir=" + dir, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  let targets = null as Array<{ type: string; webSocketDebuggerUrl: string }> | null;
  for (let i = 0; i < 60 && !targets; i++) {
    await sleep(500);
    try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as typeof targets; } catch {}
  }
  if (!targets) throw new Error("chrome did not start");
  const ws = new WebSocket(targets.find((t) => t.type === "page")!.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map<number, (d: any) => void>();
  let onChooser: ((backendNodeId: number) => void) | null = null;
  ws.onmessage = (m) => {
    const d = JSON.parse(String(m.data));
    if (d.id && pending.has(d.id)) { pending.get(d.id)!(d); pending.delete(d.id); }
    if (d.method === "Page.fileChooserOpened") onChooser?.(d.params.backendNodeId);
  };
  const send = (method: string, params: object = {}) => new Promise<any>((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async <T = any>(expression: string): Promise<T> => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 240));
    return r.result?.result?.value;
  };
  await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: "portraitPrimary", angle: 0 } });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.setInterceptFileChooserDialog", { enabled: true });
  const touch = (type: string, x: number, y: number) => send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  const rect = (sel: string, txt?: string) =>
    ev<{ x: number; y: number; w: number; h: number; label: string } | null>(`(()=>{const q=${JSON.stringify(sel)},tx=${JSON.stringify(txt ?? null)};let els=[...document.querySelectorAll(q)];if(tx)els=els.filter(e=>(e.innerText||e.getAttribute('aria-label')||'').trim().toLowerCase().includes(tx.toLowerCase()));els=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});if(!els.length)return null;const e=els[0];e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),w:Math.round(r.width),h:Math.round(r.height),label:(e.innerText||e.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ').slice(0,50)}})()`);
  let taps = 0;
  const api = {
    taps: () => taps, resetTaps: () => (taps = 0), ev, send, rect,
    nav: async (path: string, wait = 2500) => { await send("Page.navigate", { url: BASE + path }); await sleep(wait); },
    url: () => ev<string>("location.pathname+location.search"),
    text: (n = 1500) => ev<string>(`document.body.innerText.replace(/\\n+/g,' / ').slice(0,${n})`),
    tap: async (sel: string, txt?: string) => {
      const r = await rect(sel, txt);
      if (!r) throw new Error(`nothing to tap: ${sel}${txt ? ` "${txt}"` : ""}`);
      taps++;
      await touch("touchStart", r.x, r.y); await sleep(50); await touch("touchEnd", 0, 0);
      return r;
    },
    /** The next file chooser the page opens gets this file (as the phone's picker would). */
    chooseFile: (path: string) => { onChooser = (backendNodeId) => { onChooser = null; void send("DOM.setFileInputFiles", { files: [path], backendNodeId }); }; },
    until: async (js: string, maxMs = 15000, every = 100) => {
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) { if (await ev<boolean>(`!!(${js})`).catch(() => false)) return Date.now() - t0; await sleep(every); }
      throw new Error(`timed out after ${maxMs} ms waiting for: ${js.slice(0, 90)}`);
    },
    shotFull: async (name: string) => { const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); writeFileSync(join(OUT, `${label}-${name}.png`), Buffer.from(r.result.data, "base64")); },
    shot: async (name: string) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, `${label}-${name}.png`), Buffer.from(r.result.data, "base64")); },
    signIn: (email: string, password: string) =>
      ev<boolean>(`(async()=>{const c=await fetch('/api/auth/csrf').then(r=>r.json());await fetch('/api/auth/callback/password',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:c.csrfToken,email:${JSON.stringify(email)},password:${JSON.stringify(password)},json:'true',callbackUrl:'/'})});const s=await fetch('/api/auth/session').then(r=>r.json());return !!(s&&s.user)})()`),
    close: () => { try { ws.close(); } catch {} chrome.kill(); },
  };
  return api;
}

type Row = { step: string; ok: boolean; ms: number; note: string };
const rows: Row[] = [];
async function step(name: string, fn: () => Promise<string>) {
  const t0 = Date.now();
  try { const note = await fn(); rows.push({ step: name, ok: true, ms: Date.now() - t0, note }); console.log(`PASS ${String(Date.now() - t0).padStart(7)} ms  ${name}  — ${note}`); }
  catch (e) { const note = String((e as Error).message).replace(/postgres(ql)?:\/\/\S+/g, "[db]").slice(0, 300); rows.push({ step: name, ok: false, ms: Date.now() - t0, note }); console.log(`FAIL ${String(Date.now() - t0).padStart(7)} ms  ${name}  — ${note}`); throw e; }
}

async function main() {
  const { isProductionDatabase } = await import("@/lib/db/production");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (.env.local).");
  if (isProductionDatabase(process.env.DATABASE_URL)) throw new Error("Refusing to run: this is the production database.");
  const up = await fetch(BASE + "/login", { redirect: "manual" }).then((r) => r.status < 500, () => false);
  console.log(`Self-serve import · ${RUN ? "RUN" : "DRY RUN"} · server ${BASE} ${up ? "answers" : "is NOT answering"} · database is not production · pdf ${PDF}`);
  if (!RUN) return void console.log("Dry run: nothing created. Add --run.");
  if (!up) throw new Error(`Nothing answers at ${BASE}.`);
  mkdirSync(OUT, { recursive: true });

  const { prisma } = await import("@/lib/db/client");
  const { hashPassword } = await import("@/lib/password");
  const { normalizePrefs } = await import("@/lib/plan/generator");
  const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
  const { GUEST_EMAIL_DOMAIN } = await import("@/lib/auth/route-policy");

  const tag = randomUUID().slice(0, 8);
  const pw = randomBytes(18).toString("base64url");
  const workspaces: string[] = [];
  const mk = async (kind: "self" | "coached" | "guest") => {
    const email = kind === "guest" ? `ss-${kind}-${tag}-${workspaces.length}@${GUEST_EMAIL_DOMAIN}` : `ss-${kind}-${tag}-${workspaces.length}@example.test`;
    const ws = await prisma.workspace.create({ data: { name: `self-serve test ${kind}` }, select: { id: true } });
    workspaces.push(ws.id);
    const user = await prisma.user.create({ data: { email, name: "Sam Test", role: "CLIENT", workspaceId: ws.id, passwordHash: await hashPassword(pw), emailVerified: new Date() }, select: { id: true } });
    await prisma.clientProfile.create({
      data: { workspaceId: ws.id, userId: user.id, fullName: "Sam Test", email, status: "ACTIVE", ...(kind === "coached" ? {} : { goalTargets: { athlete: { prefs: normalizePrefs(undefined), demo: false } } }) },
    });
    return { email, ws: ws.id, userId: user.id };
  };
  const phones: Phone[] = [];
  const open = async (l: string) => { const p = await openPhone(l); phones.push(p); return p; };
  const self = await mk("self");
  let failed = false;
  try {
    const p = await open("athlete");
    await p.nav("/login", 2000);
    await step("self-serve athlete signs in; Today has no plan", async () => {
      if (!(await p.signIn(self.email, pw))) throw new Error("sign-in failed");
      await p.nav("/today", 3000);
      const t = await p.text();
      for (const need of ["No plan yet", "Import", "Build it myself", "Atlas builds it", "Log another workout"]) if (!t.includes(need)) throw new Error(`Today is missing "${need}": ${t.slice(0, 200)}`);
      await p.shot("1-empty-today");
      return "No plan yet + three doors + Log another workout";
    });

    if (!SKIP_IMPORT && !ONLY_OTHERS) {
    let tFirst = 0, tReadDone = 0, tStart = 0;
    await step("Import the file (a multi-week PDF by default): tap Import, choose it, read, check, Save, Start", async () => {
      p.resetTaps();
      tFirst = Date.now();
      await p.tap("button", "Import"); // 1
      await p.until(`document.querySelector('[data-testid="plan-file"]')`);
      await p.shot("2-import-open");
      p.chooseFile(PDF);
      await p.tap("button", "choose a file"); // 2: the phone's picker opens; the file is chosen
      await p.until(`document.querySelector('[aria-label="Check your plan"]') || document.querySelector('[role=alert]')`, 150000, 250).catch(async () => { throw new Error("no result: " + (await p.text(300))); });
      const alert = await p.ev<string | null>(`(document.querySelector('[role=alert]')||{}).innerText||null`);
      if (alert) throw new Error(`the read failed: ${alert}`);
      tReadDone = Date.now();
      const check = await p.ev<string>(`document.querySelector('[aria-label="Check your plan"]').innerText.replace(/\\n+/g,' | ')`);
      await p.shot("3-check-the-plan");
      const r = await p.tap("button", "Save plan"); // 3
      await p.until(`[...document.querySelectorAll('a')].some(a=>a.innerText.trim()==='Start')`, 30000, 50);
      tStart = Date.now();
      await p.shot("4-today-with-start");
      const t = await p.text(300);
      return `taps to Start: ${p.taps()}; read ${((tReadDone - tFirst) / 1000).toFixed(1)} s, save to Start ${((tStart - tReadDone) / 1000).toFixed(1)} s, total ${((tStart - tFirst) / 1000).toFixed(1)} s; save button ${r.w}x${r.h}; plan read: ${check.slice(0, 260)}; Today: ${t}`;
    });
    await step("Start opens the first workout (one more tap)", async () => {
      await p.tap("a", "Start");
      await p.until(`location.pathname.startsWith('/workouts/')`, 15000);
      const t = await p.text(200);
      await p.shot("5-first-workout");
      return `opened ${await p.url()} (${t.slice(0, 120)})`;
    });
    await step("the plan is saved: active, with weeks and workouts", async () => {
      const prof = await prisma.clientProfile.findFirstOrThrow({ where: { userId: self.userId }, select: { id: true } });
      const a = await prisma.programAssignment.findMany({ where: { clientId: prof.id }, select: { status: true, name: true, _count: { select: { assignedWorkouts: true } } } });
      if (a.length !== 1 || a[0].status !== "ACTIVE") throw new Error(`assignments: ${JSON.stringify(a)}`);
      return `1 active plan "${a[0].name}", ${a[0]._count.assignedWorkouts} workouts`;
    });

    if (BENCH_WEEKS) {
      await step("each week saved as written: the bench press's sets, reps and weight per week", async () => {
        const prof = await prisma.clientProfile.findFirstOrThrow({ where: { userId: self.userId }, select: { id: true } });
        const rows = await prisma.assignedWorkoutExercise.findMany({
          where: { assignedWorkout: { programAssignment: { clientId: prof.id } }, exercise: { name: { contains: "Bench", mode: "insensitive" } } },
          orderBy: { assignedWorkout: { scheduledDate: "asc" } },
          select: { prescribedSets: true },
        });
        const got = rows.map((r) => {
          const sets = r.prescribedSets as Array<{ repMin: number; repMax: number; weight: number | null }>;
          return `${sets.length}x${sets[0].repMin}-${sets[0].repMax}@${sets[0].weight}`;
        });
        if (JSON.stringify(got) !== JSON.stringify(BENCH_WEEKS)) throw new Error(`bench by week: ${got.join(", ")} (expected ${BENCH_WEEKS.join(", ")})`);
        return got.join(" · ");
      });
    }

    }

    await step("Atlas builds it lands on Today with Start", async () => {
      const a = await mk("self");
      const ph = await open("atlas");
      await ph.nav("/login", 1500);
      if (!(await ph.signIn(a.email, pw))) throw new Error("sign-in failed");
      await ph.nav("/today", 3000);
      await ph.tap("button", "Atlas builds it");
      await sleep(600);
      // Through the wizard with what it starts with, to its last button.
      for (let i = 0; i < 8; i++) {
        if (await ph.rect("button", "Build my plan")) break;
        await ph.tap("button", "Continue");
        await sleep(400);
      }
      if (await ph.rect("button", "Rebuild my plan")) throw new Error('a first plan says "Rebuild"');
      await ph.tap("button", "Build my plan");
      await ph.until(`location.pathname==='/today' && [...document.querySelectorAll('a')].some(a=>a.innerText.trim()==='Start')`, 30000);
      await ph.shot("today-after-atlas");
      // A past session of Upper A with a note, so the Plan tab has history to show.
      const prof = await prisma.clientProfile.findFirstOrThrow({ where: { userId: a.userId }, select: { id: true } });
      const upper = await prisma.assignedWorkout.findFirstOrThrow({ where: { programAssignment: { clientId: prof.id, status: "ACTIVE" } }, orderBy: [{ scheduledDate: "asc" }, { order: "asc" }], select: { id: true, name: true } });
      await prisma.workoutLog.create({ data: { clientId: prof.id, assignedWorkoutId: upper.id, source: "GENERATED", date: new Date(), completedAt: new Date(), clientNotes: "Bench felt heavy on set 3" } });

      // The Plan tab: no explainer text up top, no open note box, history under the workout.
      await ph.nav("/plan", 3000);
      const plan = await ph.text(4000);
      // How busy the Plan tab is, as it opens (the next workout open): everything tappable, on the first screen and in all.
      const count = await ph.ev<{ screen: number; page: number }>(`(()=>{const els=[...document.querySelectorAll('a,button,input,textarea,select,[role=button],[role=tab],[role=switch]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.closest('nav')});return {screen:els.filter(e=>{const r=e.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).length,page:els.length}})()`);
      await ph.shot("plan-tab-390x844");
      if (/every 4th week|Groove the lifts|Lighter week — recover|never count as a record/.test(plan)) throw new Error("an explainer line is still there");
      // Option B: up next first with Start, then the week, "All N weeks" and "Edit plan"; the workout cards are under Edit plan.
      if (!/Up next/i.test(plan) || !/All \d+ weeks/.test(plan) || !plan.includes("Edit plan")) throw new Error(`not the up-next layout: ${plan.slice(0, 300)}`);
      await ph.tap("a", "Edit plan");
      await ph.until(`location.search.includes('view=edit')`, 8000);
      await sleep(800);
      await ph.tap("button", upper.name);
      await sleep(500);
      const boxes = await ph.ev<number>(`[...document.querySelectorAll('textarea')].filter(t=>t.getBoundingClientRect().height>0&&!t.placeholder.startsWith('Anything about the plan')).length`);
      if (boxes !== 0) throw new Error(`${boxes} workout note box(es) open before Add note`);
      if (!(await ph.text(6000)).includes("Bench felt heavy on set 3")) throw new Error("past session's note not shown");
      await ph.shotFull("plan-tab");
      const add = await ph.tap("button", "Add note");
      await ph.until(`document.activeElement && document.activeElement.tagName==='TEXTAREA'`, 3000);
      await ph.send("Input.insertText", { text: "Swap rows for chest-supported rows" });
      await ph.ev(`document.activeElement.blur()`);
      await ph.until(`[...document.querySelectorAll('p')].some(p=>p.innerText==='Swap rows for chest-supported rows') && !document.querySelector('textarea:focus')`, 8000);
      const saved = await prisma.assignedWorkout.findUniqueOrThrow({ where: { id: upper.id }, select: { notes: true } });
      if (saved.notes !== "Swap rows for chest-supported rows") throw new Error(`saved note: ${saved.notes}`);
      await ph.shot("plan-note-saved");
      return `on /today with Start; Plan tab interactive (not counting the tab bar): ${count.screen} on the first screen, ${count.page} on the page; no explainer, note box closed, history shown; Add note ${add.w}x${add.h} -> saved and shown`;
    });

    await step("too big: a 6 MB PDF gets a clear message, in the browser and from the server", async () => {
      const b = await mk("self");
      const ph = await open("toobig");
      await ph.nav("/login", 1500);
      if (!(await ph.signIn(b.email, pw))) throw new Error("sign-in failed");
      await ph.nav("/today", 3000);
      await ph.tap("button", "Import");
      await ph.until(`document.querySelector('[data-testid="plan-file"]')`);
      ph.chooseFile(TOO_BIG);
      await ph.tap("button", "choose a file");
      await ph.until(`document.querySelector('[role=alert]')`, 10000);
      const shown = await ph.ev<string>(`document.querySelector('[role=alert]').innerText`);
      if (!/6\.2 MB.*screenshots/.test(shown)) throw new Error(`message: ${shown}`);
      await ph.shot("too-big");
      // Past the browser (a script, or an older page): the server says the same, before any reading.
      const server = await ph.ev<{ status: number; error?: string }>(`(async()=>{const f=new FormData();f.append('file0',new File([new Uint8Array(6158018)],'big.pdf',{type:'application/pdf'}));const r=await fetch('/api/athlete/plan-import',{method:'POST',body:f});return {status:r.status,...(await r.json().catch(()=>({})))}})()`);
      if (server.status !== 413) throw new Error(`server ${server.status}`);
      return `browser: "${shown}" · server ${server.status}: "${server.error}"`;
    });

    /** The bench press's prescription week by week, as saved. */
    const benchWeeks = (rows: Array<{ prescribedSets: unknown }>) =>
      rows.map((r) => {
        const sets = r.prescribedSets as Array<{ repMin: number; repMax: number; weight: number | null }>;
        return `${sets.length}x${sets[0].repMin}-${sets[0].repMax}@${sets[0].weight}`;
      });
    const benchWhere = { exercise: { name: { contains: "Bench", mode: "insensitive" as const } } };

    if (!SKIP_IMPORT && BENCH_WEEKS) {
      await step("You tab: Change goals offers 'bring your own plan'; the PDF shows in the preview; Continue saves it and lands on Today", async () => {
        const y = await mk("self");
        const ph = await open("you");
        await ph.nav("/login", 1500);
        if (!(await ph.signIn(y.email, pw))) throw new Error("sign-in failed");
        // A plan to change first (Atlas builds it), so the You tab shows Change goals.
        await ph.nav("/today", 3000);
        await ph.tap("button", "Atlas builds it");
        await sleep(500);
        for (let i = 0; i < 8 && !(await ph.rect("button", "Build my plan")); i++) { await ph.tap("button", "Continue"); await sleep(350); }
        await ph.tap("button", "Build my plan");
        await ph.until(`location.pathname==='/today' && [...document.querySelectorAll('a')].some(a=>a.innerText.trim()==='Start')`, 30000);
        await ph.nav("/you?goals=1", 3000);
        ph.resetTaps();
        const t0 = Date.now();
        if (!/bring your own plan/i.test(await ph.text(3000))) throw new Error("no 'bring your own plan' on the wizard");
        ph.chooseFile(PDF);
        await ph.tap("button", "Drop your plan here");
        await ph.until(`document.querySelector('[aria-label="Check your plan"]') || document.querySelector('[role=alert]')`, 150000, 250);
        const alert = await ph.ev<string | null>(`(document.querySelector('[role=alert]')||{}).innerText||null`);
        if (alert) throw new Error(`read failed: ${alert}`);
        const tRead = Date.now();
        if (/YOUR PLAN, LIVE|Your plan, live/.test(await ph.text(6000))) throw new Error("the generated plan's preview shows beside the imported one");
        await ph.shot("you-preview");
        await ph.tap("button", "Continue");
        await ph.until(`location.pathname==='/today' && [...document.querySelectorAll('a')].some(a=>a.innerText.trim()==='Start')`, 30000, 50);
        const tStart = Date.now();
        await ph.shot("you-today");
        const prof = await prisma.clientProfile.findFirstOrThrow({ where: { userId: y.userId }, select: { id: true } });
        const live = await prisma.programAssignment.findFirstOrThrow({ where: { clientId: prof.id, status: "ACTIVE" }, select: { id: true, name: true } });
        const got = benchWeeks(await prisma.assignedWorkoutExercise.findMany({ where: { assignedWorkout: { programAssignmentId: live.id }, ...benchWhere }, orderBy: { assignedWorkout: { scheduledDate: "asc" } }, select: { prescribedSets: true } }));
        if (JSON.stringify(got) !== JSON.stringify(BENCH_WEEKS)) throw new Error(`bench by week: ${got.join(", ")}`);
        return `taps ${ph.taps()}; read ${((tRead - t0) / 1000).toFixed(1)} s, Continue to Start ${((tStart - tRead) / 1000).toFixed(1)} s; live plan "${live.name}"; bench ${got.join(" · ")}`;
      });

      // A coach (with a client) for the coach-side importers.
      const coachWs = (await prisma.workspace.create({ data: { name: "self-serve test coach" }, select: { id: true } })).id;
      workspaces.push(coachWs);
      const coachEmail = `ss-coach-${tag}@example.test`;
      const coachUser = await prisma.user.create({ data: { email: coachEmail, name: "Coach Test", role: "TRAINER", workspaceId: coachWs, passwordHash: await hashPassword(pw), emailVerified: new Date() }, select: { id: true } });
      await prisma.trainerProfile.create({ data: { userId: coachUser.id } });
      const cl = await prisma.clientProfile.create({ data: { workspaceId: coachWs, fullName: "Pat Client", status: "ACTIVE" }, select: { id: true } });
      const coach = await open("coach");
      await coach.nav("/login", 1500);
      if (!(await coach.signIn(coachEmail, pw))) throw new Error("coach sign-in failed");

      await step("coach client Plan tab: the same drop zone reads a PDF week by week (weights as targets, from week 1)", async () => {
        await coach.nav(`/clients/${cl.id}?tab=import`, 4000);
        coach.chooseFile(PDF);
        await coach.tap("button", "Drag a plan in");
        await coach.until(`[...document.querySelectorAll('button')].some(b=>/Read .*plan/.test(b.innerText))`, 10000);
        const t0 = Date.now();
        await coach.tap("button", "Read Pat");
        await coach.until(`[...document.querySelectorAll('button')].some(b=>/^Save plan/.test(b.innerText.trim())) || document.querySelector('[role=alert]')`, 150000, 250);
        const alert = await coach.ev<string | null>(`(document.querySelector('[role=alert]')||{}).innerText||null`);
        if (alert) throw new Error(`read failed: ${alert}`);
        const tRead = Date.now();
        await coach.shot("coach-client-read");
        const tSave = Date.now();
        await coach.tap("button", "Save plan");
        const progress = await coach.until(`(document.querySelector('[role=status]')||{}).innerText?.startsWith('Saving')`, 3000, 50).then(() => true, () => false);
        if (!progress) throw new Error("no progress line while saving");
        await coach.until(`(document.querySelector('[role=status]')||{}).innerText?.startsWith('Saved') || location.pathname.includes('/programs/')`, 30000, 50);
        const tApi = Date.now();
        await coach.until(`location.pathname.includes('/programs/') && !!document.querySelector('h1')`, 30000, 50);
        const tPage = Date.now();
        console.log(`    coach save: server ${((tApi - tSave) / 1000).toFixed(1)} s, then the draft page ${((tPage - tApi) / 1000).toFixed(1)} s`);
        const draft = await prisma.programAssignment.findFirstOrThrow({ where: { clientId: cl.id }, orderBy: { createdAt: "desc" }, select: { id: true, status: true } });
        const got = benchWeeks(await prisma.assignedWorkoutExercise.findMany({ where: { assignedWorkout: { programAssignmentId: draft.id }, ...benchWhere }, orderBy: { assignedWorkout: { scheduledDate: "asc" } }, select: { prescribedSets: true } }));
        if (JSON.stringify(got) !== JSON.stringify(BENCH_WEEKS)) throw new Error(`bench by week: ${got.join(", ")}`);
        const imported = await prisma.workoutLog.count({ where: { clientId: cl.id } });
        if (imported !== 0) throw new Error(`${imported} sessions imported as history from a plan PDF`);
        return `read ${((tRead - t0) / 1000).toFixed(1)} s, save ${((tApi - tSave) / 1000).toFixed(1)} s + draft page ${((tPage - tApi) / 1000).toFixed(1)} s (progress line shown); draft ${draft.status}; no history; bench ${got.join(" · ")}`;
      });

      await step("Programs library: the same drop zone reads a PDF, shows it, saves a 4-week program", async () => {
        await coach.nav("/programs/import", 3000);
        coach.chooseFile(PDF);
        const t0 = Date.now();
        await coach.tap("button", "Drag a plan in");
        await coach.until(`document.querySelector('[aria-label="Check your plan"]') || document.querySelector('[role=alert]')`, 150000, 250);
        const alert = await coach.ev<string | null>(`(document.querySelector('[role=alert]')||{}).innerText||null`);
        if (alert) throw new Error(`read failed: ${alert}`);
        const tRead = Date.now();
        await coach.shot("library-preview");
        await coach.tap("button", "Save to library");
        await coach.until(`location.pathname.startsWith('/programs/') && location.pathname!=='/programs/import'`, 30000, 100);
        const id = (await coach.url()).split("/").pop()!.split("?")[0];
        const program = await prisma.program.findUniqueOrThrow({ where: { id }, select: { name: true, blocks: { select: { order: true } } } });
        const got = benchWeeks(await prisma.workoutExercise.findMany({ where: { workout: { block: { programId: id } }, ...benchWhere }, orderBy: { workout: { block: { order: "asc" } } }, select: { prescribedSets: true } }));
        if (program.blocks.length !== 4 || JSON.stringify(got) !== JSON.stringify(BENCH_WEEKS)) throw new Error(`${program.blocks.length} blocks; bench ${got.join(", ")}`);
        return `read ${((tRead - t0) / 1000).toFixed(1)} s, save ${((Date.now() - tRead) / 1000).toFixed(1)} s; "${program.name}", 4 weekly blocks; bench ${got.join(" · ")}`;
      });
    }

    const post = (ph: Phone, body: string) => ph.ev<{ status: number; error?: string }>(`fetch('/api/athlete/plan-import',{method:'POST',body:(()=>{const f=new FormData();f.append('csv',${JSON.stringify(body)});return f})()}).then(async r=>({status:r.status,...(await r.json().catch(()=>({})))}))`);
    const CSV = "Day,Exercise,Sets,Reps\nMon,Bench Press,3,8\nMon,Row,3,8\nTue,Squat,3,8";
    await step("a coached client is refused (403) and sees no card", async () => {
      const c = await mk("coached");
      const ph = await open("coached");
      await ph.nav("/login", 1500);
      if (!(await ph.signIn(c.email, pw))) throw new Error("sign-in failed");
      const r = await post(ph, CSV);
      if (r.status !== 403) throw new Error(`status ${r.status}`);
      await ph.nav("/today", 3000);
      const t = await ph.text();
      if (/No plan yet|Atlas builds it|Build it myself/.test(t)) throw new Error("a coached client sees the doors: " + t.slice(0, 160));
      await ph.shot("coached-today");
      return `403 "${r.error}"; Today: ${t.slice(0, 120)}`;
    });
    await step("a guest is refused (403) and gets the plain fallback", async () => {
      const g = await mk("guest");
      const ph = await open("guest");
      await ph.nav("/login", 1500);
      if (!(await ph.signIn(g.email, pw))) throw new Error("sign-in failed");
      const r = await post(ph, CSV);
      if (r.status !== 403) throw new Error(`status ${r.status}`);
      await ph.nav("/today", 3000);
      const t = await ph.text();
      if (/Atlas builds it|Build it myself/.test(t)) throw new Error("a guest sees the doors: " + t.slice(0, 160));
      await ph.shot("guest-today");
      return `403 "${r.error}"; Today: ${t.slice(0, 120)}`;
    });
    await step("the daily limit on reads holds (429 after 5, before any AI call)", async () => {
      const lim = await mk("self");
      await prisma.usageLog.createMany({ data: Array.from({ length: 5 }, () => ({ workspaceId: lim.ws, userId: lim.userId, feature: "athlete-plan-import", model: "test", inputTokens: 0, outputTokens: 0, costCents: 0 })) });
      const ph = await open("limit");
      await ph.nav("/login", 1500);
      if (!(await ph.signIn(lim.email, pw))) throw new Error("sign-in failed");
      const r = await post(ph, CSV);
      if (r.status !== 429) throw new Error(`status ${r.status}`);
      return `429 "${r.error}"`;
    });
  } catch {
    failed = true;
  } finally {
    phones.forEach((x) => x.close());
    await step("cleanup: throwaway workspaces deleted", async () => {
      let removed = 0;
      for (const ws of workspaces) {
        // Renamed to guest addresses so the existing guest cleanup accepts them.
        const us = await prisma.user.findMany({ where: { workspaceId: ws }, select: { id: true } });
        if (us.length === 0) { await prisma.workspace.delete({ where: { id: ws } }); continue; } // an empty shell from a failed setup
        for (const u of us) await prisma.user.update({ where: { id: u.id }, data: { email: `cleanup-${u.id}@${GUEST_EMAIL_DOMAIN}` } });
        const r = await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true });
        removed += (r as { rows?: number } | undefined)?.rows ?? 0;
      }
      const left = await prisma.user.count({ where: { workspaceId: { in: workspaces } } });
      if (left !== 0) throw new Error(`${left} users left`);
      return `${workspaces.length} workspaces removed; users left 0`;
    }).catch(() => (failed = true));
  }
  const md = ["# Self-serve import run", "", ...rows.map((r) => `- ${r.ok ? "PASS" : "FAIL"} ${r.ms} ms — ${r.step} — ${r.note}`)].join("\n");
  writeFileSync(join(OUT, "report.md"), md);
  console.log(`\n${failed ? "FAILED" : "ALL PASSED"} · screenshots and report: ${OUT}`);
  if (failed) process.exitCode = 1;
}
main().then(() => process.exit()).catch((e) => { console.error(String(e?.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, "[db]")); process.exit(1); });
