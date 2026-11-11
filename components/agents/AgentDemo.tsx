"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, ShieldCheck, Sparkles, User, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A walkthrough of an AI assistant working with Atlas through MCP.
 *
 * The tool calls and their results were recorded from a real session against
 * the MCP server, as a demo athlete (results trimmed to the fields that
 * matter). The athlete's questions and the assistant's replies are written
 * for the walkthrough.
 */

type Step =
  | { kind: "user"; text: string; note: Note }
  | { kind: "call"; tool: string; args?: string; result: string; outcome: "ok" | "refused"; note: Note }
  | { kind: "assistant"; text: string; note: Note };

type Note = { title: string; body: string };

const STEPS: Step[] = [
  {
    kind: "user",
    text: "What's on today, and how am I actually doing?",
    note: {
      title: "An athlete asks their assistant",
      body: "Alex uses Claude (or any MCP client) with Atlas connected. Nothing is pasted in: the assistant goes and gets the real data.",
    },
  },
  {
    kind: "call",
    tool: "get_active_program",
    result: `{ "name": "Build muscle · Upper / Lower",
  "currentWeek": 10, "totalWeeks": 12,
  "nextWorkout": { "name": "Upper A",
    "exercises": ["Bench Press 4 × 6–10",
      "Barbell Row 4 × 6–10", "Overhead Press 4 × 6–10", …] } }`,
    outcome: "ok",
    note: {
      title: "It reads the plan, as written",
      body: "No user ID is passed. The server knows who is calling and binds every tool to that one athlete, so the assistant can't widen its own access.",
    },
  },
  {
    kind: "call",
    tool: "analyze_progress",
    args: "{ weeks: 8 }",
    result: `{ "strength": { "compositeChangePct": 11,
  "lifts": [{ "exercise": "Lat Pulldown",
    "baselineE1RM": 143, "currentE1RM": 173.3,
    "changePct": 21.2 }, …] } }`,
    outcome: "ok",
    note: {
      title: "Progress, computed the same way as the charts",
      body: "Estimated 1-rep max from every logged set, lighter weeks left out. It's the same code that draws the app's progressive-overload charts, so the assistant and the app never disagree.",
    },
  },
  {
    kind: "call",
    tool: "detect_plateaus",
    result: `{ "plateaued": [
    { "exercise": "Triceps Pushdown", "confidence": "high" },
    { "exercise": "Leg Extension", "confidence": "high" },
    { "exercise": "Standing Calf Raise" } ],
  "progressing": ["Lat Pulldown", "Overhead Press", …] }`,
    outcome: "ok",
    note: {
      title: "It finds what's stalled",
      body: "A lift is stalled when three sessions in a row show no gain in weight, estimated max or reps. The coach sees the same flags on the client's page and in their Inbox.",
    },
  },
  {
    kind: "call",
    tool: "get_training_recommendations",
    result: `[ { "exercise": "Bench Press", "action": "hold",
    "suggestedWeightLb": 145,
    "reasoning": "RPE 8.5 was above 8 — hold weight…" },
  { "exercise": "Lat Pulldown", "action": "progress",
    "suggestedWeightLb": 132.5 }, … ]`,
    outcome: "ok",
    note: {
      title: "Targets come from rules, not the model",
      body: "Every number here traces to Atlas's progression engine. The assistant explains the advice; it doesn't invent it.",
    },
  },
  {
    kind: "assistant",
    text: "Today is Upper A, week 10 of 12. You're up 11% in eight weeks, led by lat pulldown (+21%). Bench: stay at 145 and own the reps. Pulldown goes up to 132.5. Three accessories have stalled; triceps pushdown hasn't moved in three weeks, so it's worth changing the rep range.",
    note: {
      title: "The answer is Alex's own data",
      body: "Not generic fitness advice: the plan, the logged sets and the progression rules, in plain words.",
    },
  },
  {
    kind: "user",
    text: "My left shoulder's cranky. Swap the overhead press for something easier on it.",
    note: {
      title: "Now a change to the plan",
      body: "Assistants can do more than read. Plan edits go through the same functions the app's Plan screen uses.",
    },
  },
  {
    kind: "call",
    tool: "swap_plan_exercise",
    args: '{ planExerciseId: "876a…", slug: "incline-dumbbell-press" }',
    result: `{ "swapped": true }`,
    outcome: "ok",
    note: {
      title: "A real write, safely",
      body: "Incline dumbbell press is the same swap Atlas's own plan generator makes for a shoulder restriction. Logged history isn't touched, and the coach sees the new exercise in the plan.",
    },
  },
  {
    kind: "user",
    text: "Log bench: 145 for 9, then 145 for 8.",
    note: { title: "Logging by talking", body: "The athlete logs mid-session without opening the app." },
  },
  {
    kind: "call",
    tool: "log_workout",
    args: "{ sets: [{ bench, 145 lb × 9 }, { bench, 145 lb × 8 }] }",
    result: `{ "workout": "Upper A", "setsWritten": 2,
  "status": "in progress", "loggedBy": "CLIENT" }`,
    outcome: "ok",
    note: {
      title: "Straight into the charts",
      body: "Those sets are now in Alex's progress and the coach's view of it, exactly as if they'd been tapped in the app.",
    },
  },
  {
    kind: "user",
    text: "Can you show me Casey's workouts too?",
    note: { title: "Testing the boundaries", body: "Casey is another athlete, in a different account. The assistant tries anyway." },
  },
  {
    kind: "call",
    tool: "get_workout_history",
    args: '{ clientId: "cmwc…casey" }',
    result: "404 not found",
    outcome: "refused",
    note: {
      title: "404, never 403",
      body: "Another athlete's data comes back \"not found\", not \"forbidden\", so a refusal doesn't even confirm that the person exists.",
    },
  },
  {
    kind: "call",
    tool: "save_program",
    result: "403 forbidden · not available to your role",
    outcome: "refused",
    note: {
      title: "Roles still apply",
      body: "Writing to a coach's program library is a coach-only tool. An athlete's assistant gets a clear no.",
    },
  },
  {
    kind: "assistant",
    text: "I can only see your own training, so Casey's workouts aren't available to me.",
    note: {
      title: "Every call is on the record",
      body: "All of the calls above, including the two refusals, wrote a row to the audit log: who, which tool, on whom, and the outcome.",
    },
  },
];

const STEP_MS = 2600;

export function AgentDemo() {
  const [shown, setShown] = useState(1);
  const [playing, setPlaying] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const done = shown >= STEPS.length;
  const current = STEPS[shown - 1];

  const next = useCallback(() => setShown((n) => Math.min(STEPS.length, n + 1)), []);

  // Auto-advance while playing; stop at the end.
  useEffect(() => {
    if (!playing) return;
    if (done) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(next, STEP_MS);
    return () => clearTimeout(t);
  }, [playing, shown, done, next]);

  // Keep the newest step in view inside the transcript (not the page).
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [shown]);

  function play() {
    if (done) setShown(1);
    setPlaying(true);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      {/* Transcript */}
      <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-night">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="ml-2 truncate font-mono text-[11px] text-white/40">assistant · Atlas MCP · demo athlete “Alex”</span>
        </div>
        <ol ref={listRef} className="h-[440px] space-y-3 overflow-y-auto p-4 sm:h-[480px] sm:p-5" aria-live="polite">
          {STEPS.slice(0, shown).map((s, i) => (
            <li key={i} className={cn("fade-in", i === shown - 1 && "rise")}>
              {s.kind === "user" && (
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-ink">{s.text}</p>
                </div>
              )}
              {s.kind === "assistant" && (
                <div className="flex gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal">
                    <Sparkles className="h-3.5 w-3.5 text-white" />
                  </span>
                  <p className="max-w-[88%] text-[14px] leading-relaxed text-white/90">{s.text}</p>
                </div>
              )}
              {s.kind === "call" && (
                <div className="ml-8 rounded-xl border border-white/10 bg-white/[0.04] p-3 font-mono text-[12px] leading-relaxed">
                  <p className="text-white/85">
                    <Wrench className="mr-1.5 inline h-3 w-3 -translate-y-px text-white/40" />
                    {s.tool}
                    {s.args && <span className="text-white/40"> {s.args}</span>}
                  </p>
                  <pre className={cn("mt-1.5 whitespace-pre-wrap break-words pl-4", s.outcome === "refused" ? "text-[#E3B05F]" : "text-[#8FD3B0]/90")}>
                    {s.outcome === "refused" ? "✕ " : "✓ "}
                    {s.result}
                  </pre>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* What's happening */}
      <div className="flex min-w-0 flex-col">
        <div className="surface flex-1 p-6">
          <p className="eyebrow flex items-center gap-1.5">
            {current.kind === "user" ? <User className="h-3.5 w-3.5" /> : current.kind === "call" ? (current.outcome === "refused" ? <ShieldCheck className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />) : <Sparkles className="h-3.5 w-3.5" />}
            Step {shown} of {STEPS.length}
          </p>
          <h3 key={`t${shown}`} className="fade-in mt-3 text-2xl leading-tight text-ink">
            {current.note.title}
          </h3>
          <p key={`b${shown}`} className="fade-in mt-3 text-[15px] leading-relaxed text-ink-soft">
            {current.note.body}
          </p>
          <div className="mt-6 flex gap-1" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors duration-300", i < shown ? "bg-signal" : "bg-ink/10")} />
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => (playing ? setPlaying(false) : play())}
            className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-semibold text-white hover:bg-ink/85"
          >
            {playing ? <Pause className="h-4 w-4" /> : done ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
            {playing ? "Pause" : done ? "Watch again" : shown === 1 ? "Play the demo" : "Resume"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setShown((n) => Math.max(1, n - 1));
            }}
            disabled={shown === 1}
            aria-label="Previous step"
            className="press flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-white text-ink hover:border-ink/25 disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              next();
            }}
            disabled={done}
            aria-label="Next step"
            className="press flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-white text-ink hover:border-ink/25 disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-mute">
          Tool calls and results are recorded from a real session against the Atlas MCP server, trimmed for length. The questions and replies are written for the demo.
        </p>
      </div>
    </div>
  );
}
