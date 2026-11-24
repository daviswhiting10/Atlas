// Offline resilience, in a real browser, against a production build on the dev-sessions database (never production).
//
//   npx next build && RESEND_API_KEY= AUTH_URL=http://localhost:3091 NEXTAUTH_URL=http://localhost:3091 AUTH_TRUST_HOST=true npx next start -p 3091
//   (sign in once as the demo coach and save the browser state to state-3091.json: Playwright's storageState)
//   NODE_PATH=<a folder whose node_modules has playwright> STATE_FILE=state-3091.json node scripts/offline-audit/offline-e2e.mjs 3091 [set|reload|finish|coachfinish|invite|addclient|conflict]
//
// Each scenario uses a different plan day or client of the demo workspace (demos are limited to 6 an hour per connection),
// so run them once per fresh demo. The S4 line always prints FAIL: it only reports what the coach sees.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const PORT = Number(process.argv[2] || 3090), BASE = `http://localhost:${PORT}`, STATE = process.env.STATE_FILE || `state-${PORT}.json`;
const ONLY = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const browser = await chromium.launch({ executablePath: exe, headless: true });
async function device() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: STATE });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 80)));
  return { ctx, page, errs };
}
import { execSync } from "node:child_process";
const fresh = () => { execSync(`node demo${PORT}.mjs`, { stdio: "ignore" }); };
const results = [];
const report = (name, ok, detail) => { results.push({ name, ok, detail }); console.log((ok ? "PASS " : "FAIL ") + name + " :: " + JSON.stringify(detail)); };
const ticks = (page) => page.evaluate(() => [...document.querySelectorAll('[aria-label*="set"]')].filter((e) => /^(Mark|Unmark)/.test(e.getAttribute("aria-label") || "") || /done/i.test(e.getAttribute("aria-label") || "")).map((e) => e.getAttribute("aria-label")));
const openLogger = async (page, day = /Wed, Nov 2\d/) => { await page.goto(BASE + "/plan", { waitUntil: "load" }); await sleep(1500); await page.getByRole("button", { name: day }).first().tap(); await sleep(500); await page.getByRole("link", { name: /Open workout/ }).first().tap(); await page.waitForURL(/\/workouts\//); await page.getByLabel(/^Mark set \d+ done/).first().waitFor(); await sleep(800); return page.url(); };
const doneCount = (page) => page.evaluate(() => [...document.querySelectorAll("[aria-label]")].filter((e) => /^Mark set \d+ done/.test(e.getAttribute("aria-label"))).length);
const want = (name) => !ONLY || ONLY === name;

if (want("set")) { // S1: connection drops mid-set
  const { ctx, page, errs } = await device(); const url = await openLogger(page);
  const total = await doneCount(page);
  await ctx.setOffline(true); await sleep(300);
  await page.getByLabel(/^Mark set \d+ done/).first().tap(); await sleep(400);
  await page.getByLabel(/^Mark set \d+ done/).first().tap(); await sleep(400);
  const during = await doneCount(page);
  await ctx.setOffline(false); await sleep(5000);
  await page.goto(page.url(), { waitUntil: "load" }); await sleep(2000);
  const after = await doneCount(page);
  report("S1 two sets ticked offline are on the server after reconnect", total - after === 2 && during === total - 2, { total, during, after, pageErrors: errs.length });
  await ctx.close();
}
if (want("reload")) { // S2: tick offline, connection returns, page reloaded before the retry
  const { ctx, page } = await device(); await openLogger(page, /Thu, Nov 2\d/);
  const total = await doneCount(page);
  await ctx.setOffline(true); await page.getByLabel(/^Mark set \d+ done/).first().tap(); await sleep(500);
  await ctx.setOffline(false); await page.goto(page.url(), { waitUntil: "load" }); await sleep(4000);
  const shown = await doneCount(page);
  await page.goto(page.url(), { waitUntil: "load" }); await sleep(2500);
  const server = await doneCount(page);
  report("S2 a tick survives a reload while offline, and reaches the server", shown === total - 1 && server === total - 1, { total, shown, server });
  await ctx.close();
}
if (want("finish")) { // S3: Finish tapped offline
  const { ctx, page } = await device(); await openLogger(page, /Fri, Nov 2\d/);
  await page.getByLabel(/^Mark set \d+ done/).first().tap(); await sleep(1500);
  await ctx.setOffline(true); await sleep(300);
  await page.getByRole("button", { name: "Finish", exact: true }).tap(); await sleep(500);
  const sheet = await page.getByRole("button", { name: /Finish with only/ }).count();
  if (sheet) await page.getByRole("button", { name: /Finish with only/ }).tap();
  await sleep(1500);
  const offlineText = (await page.locator("body").innerText()).replace(/\n/g, " | ").slice(0, 200);
  await ctx.setOffline(false); await sleep(6000);
  await page.goto(BASE + "/today", { waitUntil: "load" }); await sleep(2000);
  await page.goto(BASE + "/plan", { waitUntil: "load" }); await sleep(1500);
  const wed = await page.getByRole("button", { name: /Fri, Nov 2\d/ }).first().getAttribute("aria-label");
  report("S3 a finish tapped offline completes after reconnect", /done|logged|complete/i.test(wed || ""), { offlineScreen: offlineText, wedLabel: wed });
  await ctx.close();
}
if (want("coachfinish")) { // S4: coach finish while offline
  const { ctx, page } = await device();
  await page.goto(BASE + "/clients", { waitUntil: "load" }); await sleep(1500);
  const h = (await page.locator('a[href^="/clients/c"]').evaluateAll((a) => a.map((x) => x.getAttribute("href")))).filter((x) => /^\/clients\/c[a-z0-9]+$/.test(x));
  await page.goto(BASE + h[1] + "/log", { waitUntil: "load" }); await sleep(3000);
  await page.locator("section[data-exercise] button", { hasText: /Check all/ }).first().tap(); await sleep(2500);
  await ctx.setOffline(true); await sleep(300);
  await page.getByRole("button", { name: "Finish", exact: true }).first().tap(); await sleep(500);
  const b = page.getByRole("button", { name: /Finish with only/ }); if (await b.count()) await b.tap();
  await sleep(4000);
  const txt1 = (await page.locator("[data-sonner-toast]").allInnerTexts()).join("|") || "(no toast)";
  await ctx.setOffline(false); await sleep(3000);
  const finishedAfter = /SESSION COMPLETE/.test(await page.locator("body").innerText());
  await page.goto(BASE + h[1], { waitUntil: "load" }); await sleep(2500);
  const clientTxt = (await page.locator("body").innerText()).replace(/\n/g, " | ").slice(0, 260);
  report("S4 coach finish offline: screen state after tap, and after reconnect", false, { whileOffline: txt1, stillCompleteAfterReconnect: finishedAfter, clientPage: clientTxt });
  await ctx.close();
}
if (want("invite")) { // S5: invite while offline (a client with an email)
  const { ctx, page, errs } = await device();
  await page.goto(BASE + "/clients", { waitUntil: "load" }); await sleep(1500);
  const made = await page.evaluate(async () => (await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: "Invite Offline " + Date.now() % 10000, email: "invite-offline-" + Date.now() % 100000 + "@example.test", status: "PROSPECT" }) })).json());
  await page.goto(BASE + "/clients/" + made.id, { waitUntil: "load" }); await sleep(2500);
  await page.getByRole("button", { name: /More for/ }).tap(); await sleep(500);
  await page.locator('[role="menuitem"]', { hasText: /Invite to the app/ }).first().tap(); await sleep(900);
  await ctx.setOffline(true);
  await page.getByRole("button", { name: /Yes, make the link/ }).tap(); await sleep(2000);
  const shown = (await page.locator("[data-sonner-toast]").allInnerTexts()).join("|") || "(no message)";
  const stuck = await page.getByRole("button", { name: /Yes, make the link/ }).count();
  report("S5 invite offline gives a message, no uncaught error, sheet not stuck", /connection/i.test(shown) && errs.length === 0, { shown, sheetStillOpen: stuck, uncaught: errs });
  await ctx.setOffline(false);
  await ctx.close();
}
if (want("addclient")) { // S6: Add client: offline, and a lost response
  const { open } = await import("./perflib.mjs");
  const o = await open(PORT); const ctx = o.ctx, page = o.page, errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 80)));
  await page.goto(BASE + "/clients", { waitUntil: "load" }); await sleep(2500);
  const name = "Offline Test " + Date.now() % 100000;
  const input = page.locator('input[placeholder="Jane Smith"]');
  await page.getByRole("button", { name: /Add Client/ }).first().tap(); await sleep(1200);
  await input.fill(name);
  await ctx.setOffline(true);
  await input.press("Enter"); await sleep(2000);
  const toasts = (await page.locator("[data-sonner-toast]").allInnerTexts()).join("|");
  const kept = await input.inputValue().catch(() => "(dialog closed)");
  await ctx.setOffline(false); await sleep(800);
  // lost reply: the request reaches the server, the answer never comes back
  await page.route("**/api/clients", async (route) => { if (route.request().method() === "POST") { await route.fetch(); return route.abort("connectionreset"); } return route.continue(); });
  await input.press("Enter"); await sleep(2500);
  const toast2 = (await page.locator("[data-sonner-toast]").allInnerTexts()).join("|");
  await page.unroute("**/api/clients");
  await input.press("Enter").catch(() => {}); await sleep(3000); // the retry: finds the copy already made
  await page.goto(BASE + "/clients", { waitUntil: "load" }); await sleep(2500);
  const copies = await page.locator("body").evaluate((b, n) => (b.innerText.match(new RegExp(n, "g")) || []).length, name);
  report("S6 add client: offline message, form kept, a retry after a lost reply doesn't duplicate", /connection/i.test(toasts) && kept === name && copies === 1, { offlineToast: toasts, formKept: kept === name, afterLostReply: toast2, copiesOnRoster: copies, uncaught: errs.length });
  await ctx.close();
}
if (want("conflict")) { // S8: a second device logged the same set while this one was offline
  const A = await device(), B = await device();
  const day = /Wed, Nov 2\d/;
  await openLogger(A.page, day); await openLogger(B.page, day);
  // the first set still to do, on both phones
  const lab = await A.page.getByLabel(/^Mark set \d+ done/).first().getAttribute("aria-label");
  const n = Number(lab.match(/\d+/)[0]);
  const weightA = A.page.getByLabel(new RegExp(`^Set ${n} weight`)).first(), weightB = B.page.getByLabel(new RegExp(`^Set ${n} weight`)).first();
  // A goes offline and logs set n at 77 lb
  await A.ctx.setOffline(true); await sleep(300);
  await weightA.fill("77"); await weightA.blur();
  await A.page.getByLabel(new RegExp(`^Mark set ${n} done`)).first().tap(); await sleep(600);
  // B, online, logs the same set at 55 lb
  await weightB.fill("55"); await weightB.blur();
  await B.page.getByLabel(new RegExp(`^Mark set ${n} done`)).first().tap(); await sleep(2500);
  // A comes back
  await A.ctx.setOffline(false);
  let toasts = "";
  for (let k = 0; k < 40 && !/another device/i.test(toasts); k++) { await sleep(250); toasts = (await A.page.locator("[data-sonner-toast]").allInnerTexts()).join("|"); }
  await sleep(1500);
  const shownA = await A.page.getByLabel(new RegExp(`^Set ${n} weight`)).first().inputValue();
  await A.page.goto(A.page.url(), { waitUntil: "load" }); await sleep(2500);
  const server = await A.page.getByLabel(new RegExp(`^Set ${n} weight`)).first().inputValue();
  report("S8 second device: the other phone's set stands, and this one is told", server === "55" && /another device/i.test(toasts), { set: n, aScreenAfter: shownA, serverWeight: server, toast: toasts });
  await A.ctx.close(); await B.ctx.close();
}
await browser.close();
console.log(JSON.stringify(results.map((r) => [r.name, r.ok])));
