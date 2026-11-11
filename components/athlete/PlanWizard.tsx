"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Clock, Dumbbell, Flame, HeartPulse, Home, Loader2, PersonStanding, Sparkles, Trophy, Warehouse } from "lucide-react";
import { DAYS_PER_WEEK, EQUIPMENT, EXPERIENCE, GOALS, GOAL_TEXT_MAX, generatePlan, type Experience, type Goal, type Prefs } from "@/lib/plan/generator";
import { interpretGoal } from "@/lib/plan/goal";
import type { Equipment } from "@/lib/plan/catalog";
import { rebuildPlan } from "@/lib/actions/athlete";
import { createAccount } from "@/lib/actions/account";
import { BuildingOverlay, useGuestSignIn } from "./guest";
import { CredentialFields, inputClass, signInWithPassword } from "./account";
import { cn } from "@/lib/utils";

const GOAL_ICONS: Record<Goal, typeof Dumbbell> = { muscle: Dumbbell, strength: Trophy, fat_loss: Flame, general: HeartPulse };
const EQUIPMENT_ICONS: Record<Equipment, typeof Dumbbell> = { gym: Warehouse, dumbbells: Home, bodyweight: PersonStanding };

function Choice({
  selected,
  onClick,
  title,
  blurb,
  icon: Icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  blurb?: string;
  icon?: typeof Dumbbell;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "press flex w-full items-center gap-4 rounded-2xl border bg-white p-4 text-left",
        selected ? "border-signal" : "border-line hover:border-ink/20"
      )}
    >
      {Icon && (
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors", selected ? "bg-signal text-white" : "bg-ink/5 text-ink-soft")}>
          <Icon className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        {blurb && <span className="mt-0.5 block text-[13px] leading-snug text-ink-mute">{blurb}</span>}
      </span>
      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors", selected ? "border-signal bg-signal text-white" : "border-line")}>
        {selected && <Check className="h-3 w-3" strokeWidth={3.5} />}
      </span>
    </button>
  );
}

function Pill({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "press tnum h-12 flex-1 rounded-xl border text-[15px] font-semibold",
        selected ? "border-signal bg-signal text-white" : "border-line bg-white text-ink hover:border-ink/20"
      )}
    >
      {children}
    </button>
  );
}

export function PlanPreview({ prefs, className }: { prefs: Prefs; className?: string }) {
  const plan = useMemo(() => generatePlan(prefs), [prefs]);
  return (
    <div className={cn("surface p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-signal" /> Your plan, live
          </p>
          <h3 className="mt-1.5 font-display text-[26px] leading-tight text-ink">{plan.name}</h3>
        </div>
        <span className="tnum flex shrink-0 items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink-soft">
          <Clock className="h-3 w-3" /> ~{plan.estMinutes} min
        </span>
      </div>

      <div className="mt-4 flex gap-1.5">
        {plan.blocks.map((b, i) => (
          <div key={b.name} className="flex-1">
            <div className={cn("h-1.5 rounded-full", i === 0 ? "bg-signal" : i === 1 ? "bg-signal/55" : "bg-signal/25")} />
            <p className="mt-1.5 text-[11px] font-medium text-ink-soft">{b.name}</p>
            <p className="text-[11px] text-ink-mute">Weeks {i * 4 + 1}–{i * 4 + 4}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        {plan.days.map((day, i) => (
          <div key={`${day.name}-${i}`} className="rounded-2xl border border-line bg-bone/50 p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                <span className="tnum mr-2 text-ink-mute">Day {i + 1}</span>
                {day.name}
              </p>
              <p className="truncate text-xs text-ink-mute">{day.focus}</p>
            </div>
            <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {day.exercises.map((e) => (
                <li key={e.slug} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate text-ink-soft">{e.name}</span>
                  <span className="tnum shrink-0 text-ink-mute">
                    {e.sets} × {e.repMin}–{e.repMax}
                    {e.unit === "secs" ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlanWizard({
  mode,
  initial,
  initialName = "",
}: {
  mode: "signup" | "rebuild";
  initial: Prefs;
  initialName?: string;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [name, setName] = useState(initialName);
  const [step, setStep] = useState(0);
  const [saving, startSaving] = useTransition();
  const { pending, start } = useGuestSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value }));
  const reading = useMemo(() => interpretGoal(prefs.goalText), [prefs.goalText]);

  const steps = [
    {
      title: "What are you training for?",
      hint: "Say it in your own words. Atlas reads the goal, any area you want to prioritise, and anything you need to work around.",
      body: (
        <div>
          <label className="block">
            <span className="sr-only">Your goal, in your own words</span>
            <textarea
              value={prefs.goalText ?? ""}
              onChange={(e) => setPrefs((p) => ({ ...p, goalText: e.target.value.slice(0, GOAL_TEXT_MAX) }))}
              rows={3}
              maxLength={GOAL_TEXT_MAX}
              placeholder="e.g. Build bigger glutes and legs, but my knees are a bit dodgy"
              className="w-full resize-none rounded-2xl border border-line bg-white p-4 text-[17px] leading-relaxed text-ink outline-none transition-shadow placeholder:text-ink-mute/60 focus:border-signal focus:shadow-[0_0_0_3px_rgba(30,107,78,0.18)]"
            />
          </label>
          <p className="mt-2 min-h-[1.25rem] text-sm text-ink-soft" aria-live="polite">
            {reading.understood.length > 0 ? (
              <>
                <span className="font-semibold text-signal">Atlas read:</span> {reading.understood.join(", ")}.
              </>
            ) : (prefs.goalText ?? "").trim() ? (
              "Nothing specific yet — add a few more words, or use a quick pick below."
            ) : null}
          </p>

          <p className="eyebrow mb-2 mt-5">{reading.goal ? "Quick picks — your words above decide the goal" : "Or pick one"}</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(GOALS) as Goal[]).map((g) => {
              const Icon = GOAL_ICONS[g];
              const selected = (reading.goal ?? prefs.goal) === g;
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => set("goal", g)}
                  className={cn(
                    "press flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left text-[15px] font-semibold",
                    selected ? "border-signal text-ink shadow-[0_0_0_3px_rgba(30,107,78,0.18)]" : "border-line text-ink-soft hover:border-ink/20"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", selected ? "text-signal" : "text-ink-mute")} />
                  {GOALS[g].label}
                </button>
              );
            })}
          </div>
        </div>
      ),
    },
    {
      title: "How much lifting have you done?",
      hint: "Newer lifters progress on less work, so the plan starts lighter on volume.",
      body: (
        <div className="space-y-2.5">
          {(Object.keys(EXPERIENCE) as Experience[]).map((x) => (
            <Choice key={x} selected={prefs.experience === x} onClick={() => set("experience", x)} title={EXPERIENCE[x].label} blurb={EXPERIENCE[x].blurb} />
          ))}
        </div>
      ),
    },
    {
      title: "What does your week look like?",
      hint: "Pick what you can keep up. A plan you follow beats a perfect one you don't.",
      body: (
        <div className="space-y-6">
          <div>
            <p className="mb-2.5 text-sm font-medium text-ink-soft">Days per week</p>
            <div className="flex gap-1.5 sm:gap-2">
              {DAYS_PER_WEEK.map((d) => (
                <Pill key={d} selected={prefs.daysPerWeek === d} onClick={() => set("daysPerWeek", d)}>
                  {d}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2.5 text-sm font-medium text-ink-soft">Time per session</p>
            <div className="flex gap-2">
              {([30, 45, 60, 75] as const).map((m) => (
                <Pill key={m} selected={prefs.minutes === m} onClick={() => set("minutes", m)}>
                  {m}
                  <span className="ml-0.5 text-xs font-medium opacity-70">min</span>
                </Pill>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "What can you train with?",
      hint: "Every exercise in your plan will match the equipment you have.",
      body: (
        <div className="space-y-2.5">
          {(Object.keys(EQUIPMENT) as Equipment[]).map((q) => (
            <Choice key={q} selected={prefs.equipment === q} onClick={() => set("equipment", q)} title={EQUIPMENT[q].label} blurb={EQUIPMENT[q].blurb} icon={EQUIPMENT_ICONS[q]} />
          ))}
        </div>
      ),
    },
    ...(mode === "signup"
      ? [
          {
            title: "Last thing — create your account",
            hint: "Your plan and everything you log are saved to it, so you can pick up on any device.",
            body: (
              <form
                id="create-account"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
                className="space-y-3"
              >
                <label className="block">
                  <span className="sr-only">First name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" required maxLength={40} autoComplete="given-name" className={inputClass} />
                </label>
                <CredentialFields email={email} password={password} onEmail={setEmail} onPassword={setPassword} newPassword />
                {accountError && (
                  <p role="alert" className="text-sm leading-relaxed text-destructive">
                    {accountError}
                  </p>
                )}
              </form>
            ),
          },
        ]
      : []),
  ];

  const last = step === steps.length - 1;
  const busy = saving || creating || pending != null;

  async function signUp() {
    setAccountError(null);
    setCreating(true);
    const res = await createAccount({ name, email, password, prefs });
    if (!res.ok) {
      setAccountError(res.error);
      setCreating(false);
      return;
    }
    if (await signInWithPassword(email, password)) {
      window.location.assign("/today");
      return;
    }
    // The account exists; signing in is the only step left.
    window.location.assign("/login");
  }

  function submit() {
    if (mode === "signup") {
      void signUp();
      return;
    }
    startSaving(async () => {
      try {
        await rebuildPlan(prefs);
        toast.success("Your new plan is ready");
        router.push("/plan");
      } catch {
        toast.error("Couldn't rebuild your plan. Please try again.");
      }
    });
  }

  const current = steps[step];

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
        <div>
          <div className="mb-6 flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((_, i) => (
              <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i <= step ? "bg-signal" : "bg-ink/10")} />
            ))}
          </div>

          <div key={step} className="rise">
            <h1 className="font-display text-[34px] leading-[1.1] text-ink sm:text-[40px]">{current.title}</h1>
            <p className="mt-2.5 text-[15px] leading-relaxed text-ink-mute">{current.hint}</p>
            <div className="mt-7">{current.body}</div>
          </div>

          <div className="mt-8 flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                disabled={busy}
                className="press flex h-[52px] items-center gap-2 rounded-2xl border border-line bg-white px-5 text-[15px] font-medium text-ink-soft hover:border-ink/20"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}
            <button
              type={last && mode === "signup" ? "submit" : "button"}
              form={last && mode === "signup" ? "create-account" : undefined}
              onClick={last && mode === "signup" ? undefined : () => (last ? submit() : setStep((s) => s + 1))}
              disabled={busy}
              className="press flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-ink px-6 text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : last ? (
                <>{mode === "signup" ? "Create account & build my plan" : "Rebuild my plan"} <Sparkles className="h-4 w-4" /></>
              ) : (
                <>Continue <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </div>
          {mode === "signup" && last && (
            <p className="mt-4 text-center text-[13px] text-ink-mute">
              Just looking?{" "}
              <button type="button" onClick={() => start({ name, prefs })} disabled={busy} className="font-semibold text-signal underline-offset-4 hover:underline">
                Try it without an account
              </button>
            </p>
          )}
          {mode === "rebuild" && (
            <p className="mt-4 text-[13px] leading-relaxed text-ink-mute">
              Rebuilding starts a fresh 12 weeks from today. Everything you&apos;ve logged stays, so your charts carry on.
            </p>
          )}
        </div>

        <PlanPreview prefs={prefs} className="lg:sticky lg:top-24 lg:self-start" />
      </div>
      <BuildingOverlay mode={creating ? "plan" : pending} />
    </>
  );
}
