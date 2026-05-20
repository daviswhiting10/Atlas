"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLACEHOLDERS = [
  "e.g. Former college soccer player, 28F, hasn't trained seriously in 2 years. Desk job, hip flexor tightness, wants to lose 15 lb and get back in shape. Has a full gym, 60 min sessions, 3x/week.",
  "e.g. 45M, new client, lifts recreationally but no structure. Overhead press hurts his right shoulder. Goal is hypertrophy, mainly upper body. Has dumbbells and a barbell at home.",
  "e.g. Marathoner, 38F, training for her first Spartan Race in 4 months. Runs 30+ miles/week, zero strength training history. Full gym access, 45 min sessions.",
];

function renderMarkdown(text: string) {
  // Minimal markdown: headers, bold, bullets
  return text
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold mt-5 mb-1.5">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-6 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^• (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\* (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, '<div class="mt-3"></div>');
}

export default function ProgramIdeaPage() {
  const [description, setDescription] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const placeholder = PLACEHOLDERS[0];

  async function generate() {
    if (!description.trim() || loading) return;
    setOutput("");
    setDone(false);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/program-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      });

      if (!res.ok || !res.body) {
        setOutput("Something went wrong. Try again.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setOutput(accumulated);
        // Scroll output into view as it streams
        outputRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }

      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setOutput("");
    setDone(false);
    setDescription("");
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Back */}
      <Link
        href="/programs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Programs
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-500" />
          <h1 className="text-xl font-bold tracking-tight">AI Program Idea</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Describe a client in plain language. Get a full NASM OPT-based session outline to use as a starting point.
        </p>
      </div>

      {/* Input */}
      {!done && (
        <div className="space-y-3">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={placeholder}
            rows={6}
            disabled={loading}
            className={cn(
              "w-full rounded-xl border bg-background px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring transition-colors",
              loading && "opacity-60"
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              ⌘ + Enter to generate
            </p>
            <Button
              onClick={generate}
              disabled={!description.trim() || loading}
              className="gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {loading ? "Generating…" : "Generate"}
            </Button>
          </div>
        </div>
      )}

      {/* Output */}
      {output && (
        <div className="rounded-2xl border bg-card p-5" ref={outputRef}>
          {done && (
            <div className="flex items-center justify-between mb-4 pb-3 border-b">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Session idea</p>
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                New idea
              </button>
            </div>
          )}
          <div
            className="text-sm leading-relaxed text-foreground [&_li]:my-0.5 [&_h2]:border-b [&_h2]:pb-1.5 [&_strong]:font-semibold"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(output) }}
          />
          {loading && (
            <span className="inline-block w-1.5 h-4 bg-violet-500 ml-0.5 animate-pulse rounded-sm" />
          )}
        </div>
      )}
    </div>
  );
}
