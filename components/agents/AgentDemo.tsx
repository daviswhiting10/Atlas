"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * An athlete chatting with an AI assistant that's connected to Atlas.
 *
 * The tool calls and their results were recorded from a real session against
 * the Atlas MCP server, as a demo athlete (trimmed to one line each). The
 * chat messages are written for the demo.
 */

type Beat =
  | { kind: "user"; text: string; caption?: string }
  | { kind: "bot"; text: string; caption?: string }
  | { kind: "tool"; tool: string; args?: string; result: string; refused?: boolean; caption?: string };

const SCRIPT: Beat[] = [
  { kind: "user", text: "What's on today, and how am I doing?", caption: "The assistant fetches the real data. Nothing is pasted in." },
  { kind: "tool", tool: "get_active_program", result: "Upper A · week 10 of 12 · bench, row, overhead press +3" },
  { kind: "tool", tool: "analyze_progress", args: "8 weeks", result: "+11% stronger · lat pulldown 143 → 173 lb est. 1RM", caption: "The same numbers the app's charts show." },
  { kind: "tool", tool: "get_training_recommendations", result: "bench: hold 145 lb · pulldown: up to 132.5 · calf raise stalled", caption: "Targets come from Atlas's rules, not the model." },
  { kind: "bot", text: "Upper A today. You're up 11% in eight weeks. Stay at 145 on bench, take pulldown to 132.5. Calf raises have stalled, so let's change those up." },
  { kind: "user", text: "Shoulder's cranky. Can you swap the overhead press?" },
  { kind: "tool", tool: "edit_plan", args: "swap_exercise → incline dumbbell press", result: "swapped", caption: "A real change to the plan, under the same rules as the app." },
  { kind: "bot", text: "Done. Incline dumbbell press today instead, easier on the shoulder." },
  { kind: "user", text: "Log bench: 145 × 9, then 145 × 8." },
  { kind: "tool", tool: "log_workout", result: "2 sets saved to Upper A", caption: "Straight into the athlete's charts, and their coach's." },
  { kind: "user", text: "Show me Casey's workouts too." },
  { kind: "tool", tool: "get_workout_history", args: "clientId: casey", result: "404 not found", refused: true, caption: "Someone else's data comes back \"not found\". It doesn't even confirm Casey exists." },
  { kind: "bot", text: "I can only see your own training.", caption: "Every call above, refusals included, is in the audit log." },
];

/** ms each beat spends "typing" or "running" before it shows, then the pause after it. */
const TYPE_MS = { user: 420, bot: 560, tool: 380 } as const;
const GAP_MS = 520;

export function AgentDemo() {
  const [shown, setShown] = useState(0);
  const [pending, setPending] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const done = shown >= SCRIPT.length;

  const play = useCallback(() => {
    setShown(0);
    setCaption(null);
    setPending(false);
    setPlaying(true);
  }, []);

  // Start the first time the demo scrolls into view.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          play();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [play]);

  // One beat at a time: show it "typing" / "running", then reveal it, then pause.
  useEffect(() => {
    if (!playing) return;
    if (done) {
      setPlaying(false);
      return;
    }
    const beat = SCRIPT[shown];
    setPending(true);
    const reveal = setTimeout(() => {
      setPending(false);
      if (beat.caption) setCaption(beat.caption);
      const next = setTimeout(() => setShown((n) => n + 1), GAP_MS);
      cleanup.current = () => clearTimeout(next);
    }, TYPE_MS[beat.kind]);
    const cleanup = { current: () => {} };
    return () => {
      clearTimeout(reveal);
      cleanup.current();
    };
  }, [playing, shown, done]);

  // Keep the newest message in view inside the chat (not the page), whenever
  // the conversation grows: a new message, or a typing bubble turning into text.
  useEffect(() => {
    const list = listRef.current;
    const content = contentRef.current;
    if (!list || !content) return;
    const ro = new ResizeObserver(() => {
      list.scrollTop = list.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  const visible = SCRIPT.slice(0, pending ? shown + 1 : shown);

  return (
    <div ref={rootRef} className="mx-auto max-w-3xl">
      <div className="overflow-hidden rounded-2xl bg-night shadow-[0_30px_60px_-30px_rgba(11,15,26,0.6)]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-signal">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="text-[13px] font-semibold text-white">Assistant</span>
          <span className="text-[12px] text-white/40">· connected to Atlas</span>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-white/40">
            <span className={cn("h-1.5 w-1.5 rounded-full", playing ? "animate-pulse bg-[#8FD3B0]" : "bg-white/25")} /> {playing ? "live" : "demo"}
          </span>
        </div>

        <div ref={listRef} className="h-[420px] overflow-y-auto px-4 py-5 sm:h-[460px] sm:px-6" aria-live="polite">
          <div ref={contentRef} className="space-y-2.5">
          {visible.map((b, i) => {
            const isPending = pending && i === shown;
            if (b.kind === "user") {
              return (
                <div key={i} className="chat-in flex justify-end">
                  <div className="max-w-[82%] rounded-2xl rounded-br-md bg-white px-3.5 py-2 text-[14.5px] leading-snug text-ink">
                    {isPending ? <Dots dark /> : b.text}
                  </div>
                </div>
              );
            }
            if (b.kind === "bot") {
              return (
                <div key={i} className="chat-in flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.08] px-3.5 py-2 text-[14.5px] leading-snug text-white/90">
                    {isPending ? <Dots /> : b.text}
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="chat-in flex items-center gap-2 pl-1 font-mono text-[12px] leading-relaxed">
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                    isPending ? "border border-white/30" : b.refused ? "bg-[#E3B05F]/20 text-[#E3B05F]" : "bg-[#8FD3B0]/15 text-[#8FD3B0]"
                  )}
                >
                  {isPending ? <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white/60" /> : b.refused ? <X className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />}
                </span>
                <span className="min-w-0 truncate">
                  <span className="text-white/75">{b.tool}</span>
                  {b.args && <span className="text-white/35"> ({b.args})</span>}
                  {!isPending && <span className={b.refused ? "text-[#E3B05F]" : "text-white/50"}> → {b.result}</span>}
                </span>
              </div>
            );
          })}
          </div>
        </div>
      </div>

      <div className="mt-4 flex min-h-[44px] items-center justify-between gap-4">
        <p key={caption ?? "none"} className="fade-in min-w-0 text-[14px] leading-snug text-ink-soft">
          {caption ?? "An athlete talks to their AI assistant, which works through Atlas."}
        </p>
        <button
          type="button"
          onClick={play}
          disabled={playing}
          className="press flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-ink/25 disabled:opacity-40"
        >
          {done ? <RotateCcw className="h-4 w-4" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          {done ? "Replay" : playing ? "Playing" : "Play"}
        </button>
      </div>
      <p className="mt-1 text-[12px] text-ink-mute">Tool calls and results are from a real session against the Atlas MCP server; the chat is written for the demo.</p>
    </div>
  );
}

function Dots({ dark = false }: { dark?: boolean }) {
  return (
    <span className="flex h-5 items-center gap-1" aria-label="typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn("h-1.5 w-1.5 animate-bounce rounded-full", dark ? "bg-ink/40" : "bg-white/50")} style={{ animationDelay: `${i * 120}ms`, animationDuration: "900ms" }} />
      ))}
    </span>
  );
}
