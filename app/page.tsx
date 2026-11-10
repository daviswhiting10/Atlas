import Link from "next/link";
import { ArrowRight, ChartNoAxesCombined, ListChecks, Play, Target } from "lucide-react";
import { Logo } from "@/components/athlete/Logo";
import { DemoButton } from "@/components/athlete/guest";

const FEATURES = [
  {
    icon: ListChecks,
    title: "A plan built from your goal",
    body: "Answer four questions. Atlas picks your split, exercises, sets and reps, and lays out 12 weeks in three blocks.",
  },
  {
    icon: Target,
    title: "Told exactly what to lift",
    body: "Each set shows a target based on your last session. Hit the top of your rep range and the weight goes up.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Charts that draw themselves",
    body: "Every set you log adds a point. Chase weight, reps, estimated max or volume — the chart follows your goal.",
  },
];

const STEPS = [
  ["Pick a goal", "Muscle, strength, fat loss or general fitness, plus your schedule and equipment."],
  ["Train the plan", "Open today's workout, follow the targets, tap each set when it's done."],
  ["Watch it climb", "Personal records are marked as they happen and your next target is always on the chart."],
];

// Hero chart: one lift's estimated max over eight weeks.
const POINTS = [
  [20, 178], [70, 166], [120, 158], [170, 150], [220, 131], [270, 122], [320, 98], [370, 84], [420, 62],
];
const LINE = POINTS.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
const AREA = `${LINE} L420 210 L20 210 Z`;
const PRS = [4, 6, 8];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-bone">
      <div aria-hidden="true" className="aura aura-tl opacity-70" />
      <div aria-hidden="true" className="aura aura-br opacity-60" />

      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:h-20 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1.5 sm:gap-3">
          <Link href="/login" className="press rounded-full px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink">
            Coach sign in
          </Link>
          <Link href="/start" className="press rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/85">
            Get started
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="grid items-center gap-12 pb-16 pt-8 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-24">
          <div>
            <p className="rise eyebrow inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-1.5 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-blue" /> Strength training, made obvious
            </p>
            <h1 className="rise rise-1 mt-5 font-display text-[46px] leading-[1.02] text-ink sm:text-[68px]">
              A plan built for your goal. Progress you can <em className="text-blue">see</em>.
            </h1>
            <p className="rise rise-2 mt-5 max-w-xl text-[17px] leading-relaxed text-ink-soft">
              Atlas writes your 12-week program, tells you what to lift every session, and turns each set you log into a
              chart that keeps climbing.
            </p>
            <div className="rise rise-3 mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/start"
                className="press flex h-14 items-center justify-center gap-2 rounded-2xl bg-blue px-7 text-base font-semibold text-white shadow-[0_16px_32px_-14px_rgba(43,107,255,0.95)] hover:bg-blue-deep"
              >
                Build my plan <ArrowRight className="h-4 w-4" />
              </Link>
              <DemoButton className="press flex h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-7 text-base font-semibold text-ink hover:border-ink/20 disabled:opacity-60">
                <Play className="h-4 w-4 fill-current" /> Explore a live demo
              </DemoButton>
            </div>
            <p className="rise rise-4 mt-4 text-sm text-ink-mute">
              No email or password. The demo opens with nine weeks of training already logged.
            </p>
          </div>

          {/* Hero visual */}
          <div className="rise rise-2 relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="surface-night p-6 sm:p-7">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-white/55">Bench Press · Est. 1RM</p>
                  <p className="tnum mt-1.5 font-display text-5xl">
                    218 <span className="font-body text-base font-medium text-white/55">lb</span>
                  </p>
                </div>
                <span className="tnum rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-[#8EE3B0]">+17% in 8 weeks</span>
              </div>
              <svg viewBox="0 0 440 220" className="mt-4 w-full" aria-hidden="true">
                <defs>
                  <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7BA7FF" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#7BA7FF" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[60, 110, 160].map((y) => (
                  <line key={y} x1="20" x2="420" y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />
                ))}
                <path d={AREA} fill="url(#hero-area)" className="fade-in" style={{ animationDelay: "1.4s", animationDuration: "900ms" }} />
                <path d={LINE} pathLength={1} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="draw" />
                {POINTS.map(([x, y], i) => (
                  <g key={x} className="fade-in" style={{ animationDelay: `${500 + i * 220}ms` }}>
                    {PRS.includes(i) && <circle cx={x} cy={y} r="11" fill="#E0962A" opacity="0.25" />}
                    <circle cx={x} cy={y} r={PRS.includes(i) ? 5 : 3.5} fill={PRS.includes(i) ? "#E0962A" : "#0B0F1A"} stroke="#fff" strokeWidth="2" />
                  </g>
                ))}
              </svg>
              <div className="mt-1 flex justify-between text-[11px] text-white/45">
                <span>Week 1</span>
                <span>Week 4</span>
                <span>Week 8</span>
              </div>
            </div>

            <div className="surface rise rise-4 -mt-6 ml-auto mr-3 w-[86%] p-4 sm:mr-6 sm:w-[78%]">
              <p className="eyebrow">Today&apos;s target</p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p className="tnum text-lg font-semibold text-ink">
                  165 lb <span className="text-ink-mute">×</span> 8
                </p>
                <span className="rounded-full bg-blue/10 px-2.5 py-1 text-xs font-semibold text-blue-deep">+5 lb</span>
              </div>
              <p className="mt-1 text-[13px] leading-snug text-ink-mute">You hit 10 reps at 160 last week — the top of your range.</p>
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section className="grid gap-4 pb-16 md:grid-cols-3 lg:pb-24">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="surface card-lift p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue/10 text-blue">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-5 font-display text-2xl text-ink">{title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{body}</p>
            </div>
          ))}
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section className="pb-16 lg:pb-24">
          <h2 className="font-display text-4xl text-ink sm:text-5xl">Three steps, then it runs itself.</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="border-t border-ink/15 pt-5">
                <span className="tnum font-mono text-sm text-blue">0{i + 1}</span>
                <h3 className="mt-2 font-body text-lg font-semibold text-ink">{title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────────────── */}
        <section className="surface-night mb-12 px-6 py-12 text-center sm:px-12 sm:py-16">
          <h2 className="mx-auto max-w-2xl font-display text-4xl leading-tight sm:text-5xl">Your first workout is ready in thirty seconds.</h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/start" className="press flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-7 text-base font-semibold text-ink hover:bg-white/90 sm:w-auto">
              Build my plan <ArrowRight className="h-4 w-4" />
            </Link>
            <DemoButton className="press flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-white/20 px-7 text-base font-semibold text-white hover:bg-white/10 disabled:opacity-60 sm:w-auto">
              <Play className="h-4 w-4 fill-current" /> Explore a live demo
            </DemoButton>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 border-t border-line px-5 py-8 text-sm text-ink-mute sm:flex-row sm:items-center sm:px-8">
        <Logo />
        <p>Next.js · Postgres · Prisma · Auth.js — plan engine and overload logic are pure, unit-tested TypeScript.</p>
      </footer>
    </div>
  );
}
