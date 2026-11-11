"use client";

import { useState } from "react";
import { FileSpreadsheet, Sparkles } from "lucide-react";
import { CoachPlanForm } from "./CoachPlanForm";
import { SheetPlanUpload } from "./SheetPlanUpload";
import { cn } from "@/lib/utils";

type Client = { id: string; fullName: string; primaryGoal: string | null };

/**
 * A new plan for a client: their own plan from a spreadsheet (the usual
 * case), or one built by Atlas. Only the chosen way shows.
 */
export function NewPlanChooser({
  clients,
  initialClientId,
  initialTags,
  initialMode = "upload",
}: {
  clients: Client[];
  initialClientId?: string;
  initialTags?: { goals: string[]; conditions: string[] };
  initialMode?: "upload" | "build";
}) {
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [mode, setMode] = useState<"upload" | "build">(initialMode);
  const client = clients.find((c) => c.id === clientId);
  const first = client?.fullName.split(" ")[0];

  const choices = [
    { value: "upload" as const, icon: FileSpreadsheet, title: "Upload my plan", body: "From your Google Sheet or a CSV, with the weeks already done." },
    { value: "build" as const, icon: Sparkles, title: "Build one with Atlas", body: "From their goal: a 4-week plan you can edit." },
  ];

  return (
    <div className="space-y-6">
      <label className="block max-w-md">
        <span className="eyebrow">For</span>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="mt-1.5 h-12 w-full rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink outline-none focus:border-ink/40"
        >
          <option value="">Choose a client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="How">
        {choices.map(({ value, icon: Icon, title, body }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "press flex items-start gap-3 rounded-2xl border p-4 text-left",
              mode === value ? "border-ink bg-white shadow-[0_0_0_1px_var(--ink)]" : "border-line bg-white/60 hover:border-ink/25"
            )}
          >
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", mode === value ? "bg-ink text-white" : "bg-ink/5 text-ink-soft")}>
              <Icon className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[15px] font-semibold text-ink">{title}</span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-mute">{body}</span>
            </span>
          </button>
        ))}
      </div>

      <div key={mode} className="fade-in">
        {mode === "upload" ? (
          client ? (
            <div className="surface max-w-2xl p-5">
              <SheetPlanUpload key={client.id} clientId={client.id} firstName={first!} />
            </div>
          ) : (
            <p className="text-[15px] text-ink-soft">Choose who the plan is for, then paste the sheet link.</p>
          )
        ) : (
          <CoachPlanForm clients={clients} fixedClientId={clientId} initialTags={initialTags} />
        )}
      </div>
    </div>
  );
}
