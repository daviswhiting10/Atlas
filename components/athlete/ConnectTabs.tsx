"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConnectOption = { label: string; code: string; note: string };

/** Tabbed "how to connect" snippets with a copy button. */
export function ConnectTabs({ options }: { options: ConnectOption[] }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const current = options[active];

  async function copy() {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked (insecure context, permissions). The text is selectable either way.
    }
  }

  return (
    <div>
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Client">
        {options.map((o, i) => (
          <button
            key={o.label}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => {
              setActive(i);
              setCopied(false);
            }}
            className={cn(
              "press -mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium",
              i === active ? "border-ink text-ink" : "border-transparent text-ink-mute hover:text-ink"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="relative mt-5 rounded-xl bg-night">
        <pre className="overflow-x-auto p-5 pr-24 font-mono text-[13px] leading-relaxed text-white/90">
          <code>{current.code}</code>
        </pre>
        <button
          type="button"
          onClick={copy}
          className="press absolute right-3 top-3 flex h-8 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 text-xs font-medium text-white/80 hover:bg-white/10"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{current.note}</p>
    </div>
  );
}
