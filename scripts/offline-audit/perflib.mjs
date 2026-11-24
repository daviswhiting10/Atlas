import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function open(port, { cpu = 1 } = {}) {
  const browser = await chromium.launch({ executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", headless: true, args: ["--disable-gpu-vsync", "--disable-frame-rate-limit"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", storageState: process.env.STATE_FILE || `state-${port}.json` });
  await ctx.addInitScript(() => {
    const eff = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
    const shown = (el, thr = 0.98) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && eff(el) >= thr; };
    // ready spec: {url?: regex src, sel?: css, text?: regex src, gone?: css, noSkeleton?: bool}
    window.__ready = (s, thr = 0.98) => {
      if (s.url && !new RegExp(s.url).test(location.pathname)) return false;
      if (s.sel) { const els = [...document.querySelectorAll(s.sel)].filter((e) => !s.text || new RegExp(s.text, "i").test((e.innerText || "") + " " + (e.getAttribute("aria-label") || ""))); if (!els.some((e) => shown(e, thr))) return false; }
      else if (s.text && !new RegExp(s.text, "i").test(document.body.innerText)) return false;
      if (s.gone && [...document.querySelectorAll(s.gone)].some((e) => shown(e, 0.01))) return false;
      if (s.noSkeleton) { if ([...document.querySelectorAll(".animate-pulse,[data-skeleton],[aria-busy=true]")].some((e) => shown(e, 0.01))) return false; if (!document.querySelector("main")?.innerText.trim()) return false; }
      return true;
    };
    window.__m = null;
    addEventListener("pointerdown", () => { window.__m = { t0: performance.now(), done: null, first: null }; const spec = window.__spec; const step = () => { const m = window.__m; if (!m || m.done != null) return; if (spec && m.first == null && window.__ready(spec, 0.05)) m.first = Math.round(performance.now() - m.t0); if (spec && window.__ready(spec)) { requestAnimationFrame(() => { if (m.done == null) m.done = Math.round(performance.now() - m.t0); }); return; } requestAnimationFrame(step); }; requestAnimationFrame(step); }, true);
  });
  const page = await ctx.newPage();
  if (cpu > 1) { const c = await ctx.newCDPSession(page); await c.send("Emulation.setCPUThrottlingRate", { rate: cpu }); }
  return { browser, ctx, page };
}
/** Tap `loc`, wait for `spec` to be satisfied; returns ms from pointerdown to painted. */
export async function timed(page, loc, spec, { timeout = 12000 } = {}) {
  await page.evaluate((s) => { window.__spec = s; window.__m = null; }, spec);
  const el = loc.first();
  await el.waitFor({ state: "visible", timeout: 15000 });
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.tap();
  const t = Date.now();
  while (Date.now() - t < timeout) { const m = await page.evaluate(() => window.__m); if (m && m.done != null) { const net = await page.evaluate(() => { const t0 = window.__m.t0; const r = performance.getEntriesByType("resource").filter((e) => e.startTime >= t0 - 5 && (e.name.includes("_rsc=") || e.initiatorType === "fetch")); return r.length ? Math.round(Math.max(...r.map((e) => e.responseEnd)) - t0) : null; }); timed.net = net; timed.first = await page.evaluate(() => window.__m.first); return m.done; } await sleep(30); }
  timed.net = null; return null;
}
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
export const median = med;
