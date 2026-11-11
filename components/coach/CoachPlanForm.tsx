"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Sparkles } from "lucide-react";
import {
  COACH_GOALS,
  COACH_MODIFIERS,
  DAYS_PER_WEEK,
  EQUIPMENT,
  EXPERIENCE,
  GOAL_TEXT_MAX,
  PHASES,
  PHASE_LABEL,
  prefsFromCoachTags,
  resolvePrefs,
  type Experience,
  type Phase,
  type Prefs,
} from "@/lib/plan/generator";
import type { Equipment } from "@/lib/plan/catalog";
import { generateDraftPlan } from "@/lib/actions/coach-plan";
import { PlanPreview } from "@/components/athlete/PlanWizard";
import { interpretGoal } from "@/lib/plan/goal";
import { cn } from "@/lib/utils";

type Client = { id: string; fullName: string; primaryGoal: string | null };

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "press flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium",
        on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:border-ink/25 hover:text-ink"
      )}
    >
      {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      {children}
    </button>
  );
}

function Segment<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "press min-w-[2.75rem] rounded-lg border px-3 py-2 text-sm font-semibold",
            o.value === value ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:border-ink/25 hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rule py-5">
      <p className="text-[15px] font-semibold text-ink">{label}</p>
      {hint && <p className="mt-0.5 text-sm text-ink-mute">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

const today = () => new Date().toLocaleDateString("en-CA");

export function CoachPlanForm({ clients, initialClientId, initialTags }: { clients: Client[]; initialClientId?: string; initialTags?: { goals: string[]; conditions: string[] } }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [startDate, setStartDate] = useState(today());
  const [goalText, setGoalText] = useState("");
  const [goals, setGoals] = useState<string[]>(initialTags?.goals.filter((g) => COACH_GOALS[g]) ?? []);
  const [modifiers, setModifiers] = useState<string[]>(initialTags?.conditions.filter((c) => COACH_MODIFIERS[c]) ?? []);
  const [experience, setExperience] = useState<Experience>("intermediate");
  const [daysPerWeek, setDays] = useState<Prefs["daysPerWeek"]>(3);
  const [minutes, setMinutes] = useState<Prefs["minutes"]>(60);
  const [equipment, setEquipment] = useState<Equipment>("gym");
  const [phases, setPhases] = useState<Phase[]>([...PHASES]);
  const [pending, start] = useTransition();

  const toggle = (list: string[], set: (v: string[]) => void, item: string) => set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  // Every input lands in one set of generator preferences: the same generator the athlete uses.
  const prefs = useMemo(
    () => prefsFromCoachTags({ goal: "muscle", experience, daysPerWeek, minutes, equipment, goalText, phases }, { goals, conditions: modifiers }),
    [experience, daysPerWeek, minutes, equipment, goalText, phases, goals, modifiers]
  );
  const resolved = useMemo(() => resolvePrefs(prefs), [prefs]);
  const client = clients.find((c) => c.id === clientId);

  function generate() {
    if (!clientId) return void toast.error("Choose who the plan is for.");
    start(async () => {
      const res = await generateDraftPlan({ clientId, prefs, startDate });
      if (!res.ok) return void toast.error(res.error);
      router.push(`/clients/${clientId}/programs/${res.assignmentId}`);
    });
  }

  const lockedByModifier = (key: "experience" | "equipment") => modifiers.some((m) => COACH_MODIFIERS[m]?.[key] != null);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
      <div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
          <label className="block">
            <span className="eyebrow">For</span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink outline-none focus:border-ink/40"
            >
              <option value="">Choose a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="eyebrow">Starts</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink outline-none focus:border-ink/40" />
          </label>
        </div>

        <Field label="Goal, in their words" hint="Atlas reads the goal, areas to prioritise and anything to work around.">
          <textarea
            value={goalText}
            onChange={(e) => setGoalText(e.target.value.slice(0, GOAL_TEXT_MAX))}
            rows={2}
            placeholder={client?.primaryGoal ? `e.g. ${client.primaryGoal}` : "e.g. Bench 225 by summer, mind the left shoulder"}
            className="w-full resize-none rounded-lg border border-line bg-white p-3 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-mute/60 focus:border-ink/40"
          />
          <p className="mt-1.5 min-h-[1.25rem] text-sm text-ink-soft" aria-live="polite">
            {resolved.understood.length > 0 && (
              <>
                <span className="font-semibold text-signal">Atlas read:</span> {resolved.understood.join(", ")}.
              </>
            )}
          </p>
        </Field>

        <Field label="Goals" hint={interpretGoal(goalText).goal ? "The goal written above takes priority; these still add conditioning or corrective work." : "The first one picked sets the rep ranges and rest."}>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(COACH_GOALS).map((g) => (
              <Toggle key={g} on={goals.includes(g)} onClick={() => toggle(goals, setGoals, g)}>
                {g}
              </Toggle>
            ))}
          </div>
        </Field>

        <Field label="Conditions and modifiers" hint="These change which exercises are chosen and how they're loaded.">
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(COACH_MODIFIERS).map((c) => (
              <Toggle key={c} on={modifiers.includes(c)} onClick={() => toggle(modifiers, setModifiers, c)}>
                {c}
              </Toggle>
            ))}
          </div>
        </Field>

        <Field label="Experience">
          <div className={cn(lockedByModifier("experience") && "pointer-events-none opacity-40")}>
            <Segment label="Experience" value={resolved.experience} onChange={setExperience} options={(Object.keys(EXPERIENCE) as Experience[]).map((x) => ({ value: x, label: EXPERIENCE[x].label }))} />
          </div>
        </Field>

        <Field label="Schedule">
          <p className="mb-2 text-sm text-ink-mute">Days per week</p>
          <Segment label="Days per week" value={daysPerWeek} onChange={setDays} options={DAYS_PER_WEEK.map((d) => ({ value: d, label: String(d) }))} />
          <p className="mb-2 mt-4 text-sm text-ink-mute">Minutes per session</p>
          <Segment label="Minutes per session" value={minutes} onChange={setMinutes} options={([30, 45, 60, 75] as const).map((m) => ({ value: m, label: `${m}` }))} />
        </Field>

        <Field label="Equipment">
          <div className={cn(lockedByModifier("equipment") && "pointer-events-none opacity-40")}>
            <Segment label="Equipment" value={resolved.equipment} onChange={setEquipment} options={(Object.keys(EQUIPMENT) as Equipment[]).map((q) => ({ value: q, label: EQUIPMENT[q].label }))} />
          </div>
        </Field>

        <Field label={`Phases · ${phases.length * 4} weeks`} hint="Each phase is four weeks and ends with a lighter week. The plan's length is set here.">
          <div className="flex flex-wrap gap-1.5">
            {PHASES.map((ph) => (
              <Toggle key={ph} on={phases.includes(ph)} onClick={() => setPhases((cur) => (cur.includes(ph) ? (cur.length > 1 ? cur.filter((x) => x !== ph) : cur) : PHASES.filter((x) => x === ph || cur.includes(x))))}>
                {PHASE_LABEL[ph]}
              </Toggle>
            ))}
          </div>
        </Field>

        <div className="rule pt-5">
          <button
            type="button"
            onClick={generate}
            disabled={pending || !clientId}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {client ? `Generate a draft for ${client.fullName.split(" ")[0]}` : "Generate a draft"}
          </button>
          <p className="mt-2 text-center text-[13px] text-ink-mute">You&apos;ll review and edit it before {client ? client.fullName.split(" ")[0] : "the client"} sees anything.</p>
        </div>
      </div>

      <PlanPreview prefs={prefs} className="lg:sticky lg:top-24 lg:self-start" />
    </div>
  );
}
