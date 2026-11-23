// Heatmap v2 mockups. Reads data.json (real numbers from dev-sessions) and writes one HTML file per screen into ./screens.
// node build.mjs      (no dependencies; screenshots are taken separately)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(here, "data.json"), "utf8"));
const out = path.join(here, "screens");
fs.mkdirSync(out, { recursive: true });

// ── Dates (all UTC, Monday-first) ───────────────────────────────────────────────
const D = (s) => new Date(s + "T00:00:00Z");
const iso = (d) => d.toISOString().slice(0, 10);
const add = (s, n) => iso(new Date(D(s).getTime() + n * 86400000));
const monday = (s) => add(s, -((D(s).getUTCDay() + 6) % 7));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const short = (s) => `${DOW[D(s).getUTCDay()]}, ${MON[D(s).getUTCMonth()]} ${D(s).getUTCDate()}`;
const TODAY = data.today;

// ── The rule for brightness: work, relative to the athlete's own lightest and heaviest day ──────────────
// Under 6 training days there is nothing to be relative to: every training day is full brightness.
// A day's work is the SUM of its sessions (so a double day is brighter; no second dot).
const dayWork = (d) => d.work * (d.sessions || 1);
function brightnessOf(days) {
  const ws = days.filter((d) => d.sessions > 0).map(dayWork);
  const lo = Math.min(...ws), hi = Math.max(...ws);
  return (d) => (ws.length < 6 || hi === lo ? 1 : 0.35 + 0.65 * ((dayWork(d) - lo) / (hi - lo)));
}

// ── Shared look ─────────────────────────────────────────────────────────────────────────────────────────
const CSS = `
@font-face { font-family: Geist; src: url(../../../../app/fonts/GeistVF.woff); font-weight: 100 900; }
:root { --bg:#141417; --surface:#1c1c21; --raised:#26262c; --text:#e6e2db; --soft:#b6b2ab; --mute:#9a96a0; --line:rgba(230,226,219,.13); --line2:rgba(230,226,219,.42); --teal:#7cc7bd; --gold:#d8b19d; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 390px; height: 844px; background: var(--bg); color: var(--text); font-family: Geist, -apple-system, system-ui, sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }
.app { position: relative; width: 390px; height: 844px; }
header { height: 56px; display: flex; align-items: center; padding: 0 16px; border-bottom: 1px solid var(--line); gap: 10px; }
.logo { width: 32px; height: 32px; border-radius: 9px; background: var(--teal); display: grid; place-items: center; }
.logo svg { width: 18px; height: 18px; }
header b { font-size: 22px; font-weight: 600; letter-spacing: -.02em; }
main { padding: 0 16px; }
nav { position: absolute; left: 0; right: 0; bottom: 0; height: 84px; border-top: 1px solid var(--line); background: rgba(28,28,33,.92); display: flex; padding-top: 10px; }
nav div { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; color: var(--mute); }
nav div.on { color: var(--teal); }
nav svg { width: 22px; height: 22px; }
.lab { font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); }
.hero { display: flex; align-items: baseline; gap: 8px; margin-top: 10px; }
.hero .n { font-size: 64px; font-weight: 600; letter-spacing: -.045em; line-height: 1; }
.rows { margin-top: 24px; }
.row { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--line); min-height: 64px; padding: 10px 0; }
.row .t { font-size: 17px; font-weight: 600; }
.row .m { font-size: 13px; color: var(--mute); margin-top: 2px; }
.gold { color: var(--gold); }
.tiny { font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); }
.disc { border-radius: 50%; background: var(--teal); }
.ring { border-radius: 50%; border: 1.5px dashed var(--line2); }
`;
const ICON = {
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="#141417" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
  prog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16h16"/><path d="M8 15l4-4 3 3 5-6"/></svg>',
  you: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
};
const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body><div class="app">
<header><span class="logo">${ICON.logo}</span><b>Atlas</b></header><main>${body}</main>
<nav><div>${ICON.home}Today</div><div>${ICON.plan}Plan</div><div class="on">${ICON.prog}Progress</div><div>${ICON.you}You</div></nav></div></body></html>`;
const write = (name, title, body) => fs.writeFileSync(path.join(out, name + ".html"), page(title, body));

// ── Sparse: sessions as rows (all of them, newest first) ───────────────────────────────────────────────────
function sessionRows(acct) {
  const days = acct.days.filter((d) => d.sessions > 0).sort((a, b) => (a.day < b.day ? 1 : -1));
  return days
    .flatMap((d) => d.titles.map((t) => ({ day: d.day, t, sets: d.sets / d.titles.length, min: d.minutes / d.titles.length, rec: d.record })))
    .map(
      (r) => `<div class="row"><div><div class="t">${r.t}</div><div class="m">${short(r.day)} · ${Math.round(r.sets)} sets · ${Math.round(r.min)} min${r.rec ? ' · <span class="gold">Record</span>' : ""}</div></div></div>`
    )
    .join("");
}

const heroNumber = (n, label) => `<div class="lab" style="margin-top:28px">History</div><div class="hero"><span class="n">${n}</span><span class="tiny">${label}</span></div>`;

// ── Sparse A: the weeks, with the plan's coming days shown ───────────────────────────────────────────────────
function sparseA(key, n) {
  const a = data[key] || { days: [], planned: data.s3.planned };
  const planned = new Set((a.planned.length ? a.planned : data.s3.planned).filter((p) => p.day >= TODAY).map((p) => p.day));
  const trained = new Map(a.days.filter((d) => d.sessions > 0).map((d) => [d.day, d]));
  const bright = brightnessOf(a.days.length ? a.days : [{ sessions: 1, work: 1, minutes: 0 }]);
  const first = a.days.filter((d) => d.sessions > 0).map((d) => d.day).sort()[0];
  const start = monday(first && first < monday(TODAY) ? first : TODAY);
  const weeks = [];
  for (let m = start; m <= add(monday(TODAY), 14); m = add(m, 7)) weeks.push(m);
  const col = 47, cell = 28;
  const grid = weeks
    .map((m) => {
      const cells = Array.from({ length: 7 }, (_, i) => {
        const day = add(m, i);
        const t = trained.get(day);
        const isToday = day === TODAY;
        let inner;
        if (t) inner = `<span class="disc" style="width:${cell}px;height:${cell}px;opacity:${bright(t).toFixed(2)};${t.record ? "box-shadow:0 0 0 2px var(--bg),0 0 0 3.5px var(--gold)" : ""}"></span>`;
        else if (planned.has(day)) inner = `<span class="ring" style="width:${cell}px;height:${cell}px;${isToday ? "border:2px solid var(--teal)" : ""}"></span>`;
        else inner = `<span style="width:4px;height:4px;border-radius:50%;background:var(--line2);opacity:.45"></span>`;
        return `<div style="width:${col}px;height:44px;display:flex;align-items:center;justify-content:center;position:relative">${inner}${isToday ? '<i style="position:absolute;bottom:1px;width:12px;height:2px;border-radius:1px;background:var(--teal)"></i>' : ""}</div>`;
      }).join("");
      const label = `${D(m).getUTCDate()}`;
      return `<div style="display:flex;align-items:center"><div class="tiny" style="width:24px">${label}</div>${cells}</div>`;
    })
    .join("");
  const head = `<div style="display:flex;margin-top:22px"><div style="width:24px"></div>${["M", "T", "W", "T", "F", "S", "S"].map((w) => `<div class="tiny" style="width:${col}px;text-align:center">${w}</div>`).join("")}</div>`;
  const body = heroNumber(n, n === 1 ? "Session" : "Sessions") + head + `<div style="margin-top:2px">${grid}</div>` + (n > 0 ? `<div class="rows">${sessionRows(a)}</div>` : "");
  write(`sparse-a-${n}`, `Sparse A (${n})`, body);
}

// ── Sparse B: the journey through the plan (12 weeks × 4 sessions) ─────────────────────────────────────────────
function sparseB(key, n) {
  const a = data[key] || { days: [] };
  const done = n;
  const per = 4, weeks = 12;
  const bright = brightnessOf(a.days.length ? a.days : [{ sessions: 1, work: 1, minutes: 0 }]);
  const doneDays = (a.days || []).filter((d) => d.sessions > 0).sort((x, y) => (x.day < y.day ? -1 : 1));
  const pitch = 29.8, pip = 22;
  let cols = "";
  for (let w = 0; w < weeks; w++) {
    let pips = "";
    for (let k = 0; k < per; k++) {
      const idx = w * per + k;
      const d = doneDays[idx];
      const isNext = idx === done;
      pips += `<span style="display:block;margin:0 auto 7px;width:${pip}px;height:${pip}px;border-radius:50%;${d ? `background:var(--teal);opacity:${bright(d).toFixed(2)};${d.record ? "box-shadow:0 0 0 2px var(--bg),0 0 0 3.5px var(--gold)" : ""}` : isNext ? "border:2px solid var(--teal)" : "background:rgba(230,226,219,.08)"}"></span>`;
    }
    cols += `<div style="width:${pitch}px">${pips}</div>`;
  }
  const blocks = [["Foundation", 0], ["Build", 4], ["Peak", 8]]
    .map(([name, w]) => `<div class="tiny" style="position:absolute;left:${w * pitch}px">${name}</div>`)
    .join("");
  const body =
    heroNumber(n, `of ${data.plan.total}`) +
    `<div style="position:relative;height:14px;margin-top:22px">${blocks}</div>` +
    `<div style="display:flex;margin-top:8px;margin-left:-1px">${cols}</div>` +
    (n > 0 ? `<div class="rows" style="margin-top:14px">${sessionRows(a)}</div>` : "");
  write(`sparse-b-${n}`, `Sparse B (${n})`, body);
}

// ── Full: months of history, like the demo coach ────────────────────────────────────────────────────────────
const f = data.full;
const fullDays = f.days; // training days only
const byDay = new Map(fullDays.map((d) => [d.day, d]));
const bright = brightnessOf(fullDays);
const w0 = monday(f.from);
const weeksFull = [];
for (let m = w0; m <= monday(TODAY); m = add(m, 7)) weeksFull.push(m);
const records = f.recordDays.length;
const stats = `<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:10px">
  <div class="hero" style="margin-top:0"><span class="n">${f.sessions}</span><span class="tiny">Sessions</span></div>
  <div style="display:flex;gap:22px;padding-bottom:4px">
    <div style="text-align:right"><div style="font-size:24px;font-weight:600;letter-spacing:-.02em">${f.activeWeeks}/${f.weeksInRange}</div><div class="tiny">Weeks</div></div>
    <div style="text-align:right"><div class="gold" style="font-size:24px;font-weight:600;letter-spacing:-.02em">${records}</div><div class="tiny">Records</div></div>
  </div></div>`;
const recent = (() => {
  const last = [...fullDays].sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 3);
  return `<div class="rows" style="margin-top:20px">${last
    .map((d) => `<div class="row" style="min-height:58px"><div><div class="t">${d.titles[0]}</div><div class="m">${short(d.day)} · ${d.sets} sets · ${d.minutes} min${d.record ? ' · <span class="gold">Record</span>' : ""}</div></div></div>`)
    .join("")}</div>`;
})();
const ch = f.chapters[0];
const monthTicks = (pitch, left) => {
  let last = -1, html = "";
  weeksFull.forEach((m, i) => {
    const mo = D(m).getUTCMonth();
    if (mo !== last) { html += `<div class="tiny" style="position:absolute;left:${left + i * pitch}px">${MON[mo]}</div>`; last = mo; }
  });
  return html;
};

// Full A: the compact calendar, oldest left to newest right, brightness = work, gold ring = record
(function fullA() {
  const gutter = 14, pitch = (358 - gutter) / weeksFull.length, size = pitch - 3.2, rowH = pitch;
  let cols = "";
  weeksFull.forEach((m) => {
    let cells = "";
    for (let i = 0; i < 7; i++) {
      const day = add(m, i);
      const t = byDay.get(day);
      const future = day > TODAY, before = day < f.from;
      let style = `position:relative;display:block;width:${size}px;height:${size}px;border-radius:3px;margin-bottom:${rowH - size}px;`;
      let dot = "";
      if (future || before) style += "opacity:0";
      else if (t) {
        style += `background:rgba(124,199,189,${bright(t).toFixed(2)})`;
        if (t.record) dot = '<i style="position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:var(--gold)"></i>';
      } else style += "background:rgba(230,226,219,.07)";
      cells += `<span style="${style}">${dot}</span>`;
    }
    cols += `<div style="width:${pitch}px">${cells}</div>`;
  });
  const chFrom = weeksFull.findIndex((m) => add(m, 6) >= ch.from), chTo = weeksFull.findIndex((m) => add(m, 6) >= ch.to);
  const wk = ["M", "", "W", "", "F", "", ""].map((w) => `<div class="tiny" style="height:${rowH}px;line-height:${size}px;font-size:9px">${w}</div>`).join("");
  const body =
    `<div class="lab" style="margin-top:28px">History</div>` + stats +
    `<div style="position:relative;height:14px;margin-top:26px">${monthTicks(pitch, gutter)}</div>` +
    `<div style="display:flex;margin-top:6px"><div style="width:${gutter}px">${wk}</div>${cols}</div>` +
    `<div style="position:relative;margin-top:8px;height:16px"><div style="position:absolute;left:${gutter + chFrom * pitch}px;width:${(chTo - chFrom + 1) * pitch - 3}px;height:2px;border-radius:1px;background:var(--teal)"></div><div class="tiny" style="position:absolute;top:6px;left:${gutter + chFrom * pitch}px;color:var(--teal)">${ch.name}</div></div>` +
    recent;
  write("full-a", "Full A", body);
})();

// Full B: weekly rhythm bars: height = the week's hard sets, brightness = the week's average session, gold cap = a record week
(function fullB() {
  const pitch = 358 / weeksFull.length, bw = pitch - 3.2, maxH = 150;
  const weekData = weeksFull.map((m) => {
    const days = Array.from({ length: 7 }, (_, i) => byDay.get(add(m, i))).filter(Boolean);
    const sets = days.reduce((s, d) => s + d.hardSets, 0);
    const avg = days.length ? days.reduce((s, d) => s + dayWork(d), 0) / days.length : 0;
    return { m, sets, avg, rec: days.filter((d) => d.record).length, n: days.length };
  });
  const maxSets = Math.max(...weekData.map((w) => w.sets));
  const avgs = weekData.filter((w) => w.n).map((w) => w.avg);
  const lo = Math.min(...avgs), hi = Math.max(...avgs);
  const bars = weekData
    .map((w) => {
      const h = Math.max(w.n ? 3 : 0, (w.sets / maxSets) * maxH);
      const b = w.n ? (hi === lo ? 1 : 0.35 + 0.65 * ((w.avg - lo) / (hi - lo))) : 0;
      return `<div style="width:${pitch}px;height:${maxH + 8}px;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-start">
        ${Array.from({ length: w.rec }, () => `<span style="width:4px;height:4px;border-radius:50%;background:var(--gold);margin:0 0 3px ${(bw - 4) / 2}px"></span>`).join("")}
        <span style="width:${bw}px;height:${h}px;border-radius:3px 3px 1px 1px;background:var(--teal);opacity:${b.toFixed(2)}"></span></div>`;
    })
    .join("");
  const chFrom = weeksFull.findIndex((m) => add(m, 6) >= ch.from), chTo = weeksFull.findIndex((m) => add(m, 6) >= ch.to);
  const body =
    `<div class="lab" style="margin-top:28px">History</div>` + stats +
    `<div style="position:relative;height:14px;margin-top:26px"><div class="tiny" style="position:absolute;left:${chFrom * pitch}px;color:var(--teal)">${ch.name}</div></div>` +
    `<div style="position:relative;height:2px;margin-top:2px"><div style="position:absolute;left:${chFrom * pitch}px;width:${(chTo - chFrom + 1) * pitch - 3}px;height:2px;border-radius:1px;background:var(--teal)"></div></div>` +
    `<div style="display:flex;margin-top:8px;border-bottom:1px solid var(--line)">${bars}</div>` +
    `<div style="position:relative;height:16px;margin-top:6px">${monthTicks(pitch, 0)}</div>` +
    recent;
  write("full-b", "Full B", body);
})();

for (const n of [0, 1, 3]) {
  const key = n === 0 ? "s0" : `s${n}`;
  sparseA(key, n);
  sparseB(key, n);
}
console.log("wrote", fs.readdirSync(out).join(", "));
