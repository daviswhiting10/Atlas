"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronDown, Clock, Dumbbell, Loader2, Plus, RotateCcw, SkipForward, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { PlanOverview, WorkoutSummary } from "@/lib/plan/overview";
import type { CatalogExercise } from "@/lib/plan/catalog";
import { CATALOG_BY_SLUG } from "@/lib/plan/catalog";
import { BLOCK_WEEKS } from "@/lib/plan/generator";
import { ExercisePicker } from "./ExercisePicker";
import { TargetEditor, type TargetValues } from "./TargetEditor";
import { cn } from "@/lib/utils";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Everything the Plan view can change, supplied by whoever renders it. The
 * athlete's screen passes actions scoped to themselves; the coach's editor
 * passes the same actions scoped to one client. The view is identical.
 */
export type PlanActions = {
  addWorkout: (input: { week: number; name: string; copyFromWorkoutId?: string }) => Promise<Result>;
  removeWorkout: (workoutId: string) => Promise<Result>;
  addExercise: (input: { workoutId: string; slug: string }) => Promise<Result>;
  removeExercise: (input: { aweId: string; workoutId: string }) => Promise<Result>;
  swapExercise: (input: { aweId: string; workoutId: string; slug: string }) => Promise<Result>;
  setTargets: (input: { aweId: string; workoutId: string } & TargetValues) => Promise<Result>;
  setWorkoutNote: (input: { workoutId: string; text: string }) => Promise<Result>;
  setPlanNote: (text: string) => Promise<Result>;
  setSkipped?: (input: { assignedWorkoutId: string; skipped: boolean }) => Promise<void>;
};

const DELOAD_NOTE = "Lighter week: same weights, but stop each set two or three reps early and recover.";

/** A notes field that saves when you leave it. */
function NoteField({ value, placeholder, label, onSave }: { value: string | null; placeholder: string; label: string; onSave: (text: string) => Promise<Result> }) {
  const [text, setText] = useState(value ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const saved = useRef(value ?? "");

  async function save() {
    if (text.trim() === saved.current.trim()) return;
    setState("saving");
    const res = await onSave(text);
    if (res.ok) {
      saved.current = text;
      setState("saved");
      setTimeout(() => setState("idle"), 1600);
    } else {
      setState("idle");
      toast.error(res.error);
    }
  }

  return (
    <label className="block">
      <span className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <span className="text-xs text-ink-mute" aria-live="polite">
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}
        </span>
      </span>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        rows={2}
        maxLength={2000}
        placeholder={placeholder}
        className="mt-1.5 w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-mute/70 focus:border-ink/40"
      />
    </label>
  );
}

function WorkoutCard({
  w,
  isNext,
  open,
  onToggle,
  actions,
  workoutHref,
  startLabel,
}: {
  w: WorkoutSummary;
  isNext: boolean;
  open: boolean;
  onToggle: () => void;
  actions: PlanActions;
  workoutHref?: (workoutId: string) => string;
  startLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picker, setPicker] = useState<null | { mode: "add" } | { mode: "swap"; aweId: string; slug: string }>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const logged = w.status === "LOGGED";
  const skipped = w.status === "SKIPPED";

  /** Run a change, say why if it was refused, and re-read the plan. */
  function change(run: () => Promise<Result>, done?: string) {
    start(async () => {
      const res = await run();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (done) toast.success(done);
      router.refresh();
    });
  }

  function pick(exercise: CatalogExercise) {
    const p = picker;
    setPicker(null);
    if (!p) return;
    if (p.mode === "add") change(() => actions.addExercise({ workoutId: w.id, slug: exercise.slug }), `${exercise.name} added`);
    else change(() => actions.swapExercise({ aweId: p.aweId, workoutId: w.id, slug: exercise.slug }), `Swapped for ${exercise.name}`);
  }

  function toggleSkip() {
    if (!actions.setSkipped) return;
    start(async () => {
      try {
        await actions.setSkipped?.({ assignedWorkoutId: w.id, skipped: !skipped });
        toast.success(skipped ? "Back in your plan" : "Skipped — the next workout moves up");
        router.refresh();
      } catch {
        toast.error("Couldn't update that workout.");
      }
    });
  }

  return (
    <div className={cn("surface overflow-hidden", isNext && "border-ink/30")}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3.5 p-4 text-left sm:p-5">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", logged ? "bg-signal text-white" : "bg-ink/5 text-ink-mute")}>
          {logged ? <Check className="h-5 w-5" strokeWidth={3} /> : skipped ? <SkipForward className="h-4 w-4" /> : <Dumbbell className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn("truncate text-base font-semibold", skipped ? "text-ink-mute line-through" : "text-ink")}>{w.name}</span>
            {isNext && <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Up next</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-mute">
            {logged ? "Logged" : skipped ? "Skipped" : `${w.exercises.length} exercise${w.exercises.length === 1 ? "" : "s"}`}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> ~{w.estMinutes} min
            </span>
            {w.note && <span className="truncate">· has a note</span>}
          </span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-ink-mute transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="fade-in border-t border-line px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          {w.deload && <p className="mb-3 text-[13px] text-ink-mute">{DELOAD_NOTE}</p>}

          {w.exercises.length === 0 ? (
            <p className="py-2 text-[15px] text-ink-mute">No exercises yet.</p>
          ) : (
            <ol className="divide-y divide-line">
              {w.exercises.map((e, i) => {
                const cat = CATALOG_BY_SLUG[e.slug];
                const loaded = cat ? cat.tool !== "bodyweight" : true;
                return (
                  <li key={e.aweId} className="py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-4 shrink-0 text-[13px] text-ink-mute">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{e.name}</span>
                      <button
                        type="button"
                        onClick={() => setEditing(editing === e.aweId ? null : e.aweId)}
                        aria-expanded={editing === e.aweId}
                        aria-label={`Edit target for ${e.name}`}
                        className="press shrink-0 rounded-md px-2 py-1 text-[14px] text-ink-soft underline decoration-line decoration-dotted underline-offset-4 hover:bg-ink/5 hover:text-ink"
                      >
                        {e.sets} × {e.reps}
                        {e.weight != null ? ` @ ${e.weight} lb` : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPicker({ mode: "swap", aweId: e.aweId, slug: e.slug })}
                        disabled={pending}
                        className="press hidden shrink-0 rounded-md px-2 py-1 text-xs font-medium text-ink-mute hover:bg-ink/5 hover:text-ink sm:block"
                      >
                        Swap
                      </button>
                      <button
                        type="button"
                        onClick={() => change(() => actions.removeExercise({ aweId: e.aweId, workoutId: w.id }), `${e.name} removed`)}
                        disabled={pending}
                        aria-label={`Remove ${e.name}`}
                        className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-mute hover:bg-ink/5 hover:text-ink"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {editing === e.aweId && (
                      <div className="mt-2 pl-6">
                        <TargetEditor
                          initial={{ sets: e.sets, repMin: e.repMin, repMax: e.repMax, weight: e.weight }}
                          unit={e.unit}
                          loaded={loaded}
                          onCancel={() => setEditing(null)}
                          onSave={async (values) => {
                            const res = await actions.setTargets({ aweId: e.aweId, workoutId: w.id, ...values });
                            if (!res.ok) return void toast.error(res.error);
                            setEditing(null);
                            router.refresh();
                          }}
                        />
                        <button type="button" onClick={() => setPicker({ mode: "swap", aweId: e.aweId, slug: e.slug })} className="press mt-2 text-xs font-medium text-ink-mute hover:text-ink sm:hidden">
                          Swap this exercise
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          <button
            type="button"
            onClick={() => setPicker({ mode: "add" })}
            disabled={pending}
            className="press mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink/15 text-sm font-medium text-ink-mute hover:border-ink/30 hover:text-ink"
          >
            <Plus className="h-4 w-4" /> Add an exercise
          </button>

          <div className="mt-4">
            <NoteField
              key={w.id}
              label="Notes for this workout"
              value={w.note}
              placeholder="How it felt, what to change next time, anything to remember."
              onSave={(text) => actions.setWorkoutNote({ workoutId: w.id, text })}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {workoutHref && (
              <Link
                href={workoutHref(w.id)}
                className={cn(
                  "press flex h-11 min-w-[11rem] flex-1 items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-semibold",
                  logged ? "border border-line bg-white text-ink hover:border-ink/20" : "bg-ink text-white hover:bg-ink/85"
                )}
              >
                {logged ? "Review workout" : startLabel} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {!logged && actions.setSkipped && (
              <button type="button" onClick={toggleSkip} disabled={pending} className="press flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-[15px] font-medium text-ink-soft hover:border-ink/20 disabled:opacity-60">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : skipped ? <RotateCcw className="h-4 w-4" /> : <SkipForward className="h-4 w-4" />}
                {skipped ? "Restore" : "Skip"}
              </button>
            )}
            {confirmRemove ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-ink-soft">{logged ? "Remove? Logged sets stay in your history." : "Remove this workout?"}</span>
                <button type="button" onClick={() => change(() => actions.removeWorkout(w.id), `${w.name} removed`)} disabled={pending} className="press h-9 rounded-lg bg-ink px-3 font-semibold text-white">
                  Remove
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} className="press h-9 rounded-lg px-2 font-medium text-ink-soft">
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmRemove(true)} aria-label={`Remove ${w.name} from the plan`} className="press flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-[15px] font-medium text-ink-mute hover:bg-ink/5 hover:text-ink">
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            )}
          </div>
        </div>
      )}

      {picker && (
        <ExercisePicker
          title={picker.mode === "add" ? `Add to ${w.name}` : "Swap exercise"}
          exclude={w.exercises.map((e) => e.slug)}
          suggestLike={picker.mode === "swap" ? picker.slug : null}
          onPick={pick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function AddWorkout({ week, workouts, actions }: { week: number; workouts: WorkoutSummary[]; actions: PlanActions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [pending, start] = useTransition();

  function add() {
    start(async () => {
      const res = await actions.addWorkout({ week, name: name.trim() || "Extra session", ...(copyFrom && { copyFromWorkoutId: copyFrom }) });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Added to week ${week}`);
      setOpen(false);
      setName("");
      setCopyFrom("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press flex h-12 w-full items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-ink/15 text-sm font-medium text-ink-mute hover:border-ink/30 hover:text-ink"
      >
        <Plus className="h-4 w-4" /> Add a workout to week {week}
      </button>
    );
  }

  return (
    <div className="surface fade-in p-4">
      <p className="text-[15px] font-semibold text-ink">New workout in week {week}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Extra session"
            autoFocus
            className="h-11 rounded-lg border border-line bg-white px-3 text-[15px] text-ink outline-none placeholder:text-ink-mute/70 focus:border-ink/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Start from</span>
          <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="h-11 rounded-lg border border-line bg-white px-3 text-[15px] text-ink outline-none focus:border-ink/40">
            <option value="">Empty — I&apos;ll add exercises</option>
            {workouts.map((w) => (
              <option key={w.id} value={w.id}>
                A copy of {w.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="press h-10 rounded-lg px-3 text-sm font-medium text-ink-soft hover:text-ink">
          Cancel
        </button>
        <button type="button" onClick={add} disabled={pending} className="press flex h-10 items-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/85 disabled:opacity-50">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add workout
        </button>
      </div>
    </div>
  );
}

export function PlanView({
  plan,
  actions,
  workoutBase,
  startLabel = "Start this workout",
  noteLabel = "Plan notes",
}: {
  plan: PlanOverview;
  actions: PlanActions;
  /**
   * Where "Start this workout" goes: a path the workout id is appended to
   * ("/workouts"), or one with a query parameter it fills ("/clients/x/log?workoutId=").
   * Left out where logging doesn't apply, such as a coach's draft.
   */
  workoutBase?: string;
  /** Label for the start button: the athlete starts a workout, a coach logs one. */
  startLabel?: string;
  noteLabel?: string;
}) {
  const [week, setWeek] = useState(plan.currentWeek);
  const [openId, setOpenId] = useState<string | null>(plan.nextUp?.id ?? null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Centre the current week in the strip without scrolling the page itself.
  useEffect(() => {
    const el = activeRef.current;
    const strip = el?.parentElement;
    if (el && strip) strip.scrollLeft = el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2;
  }, []);

  const weeks = Array.from({ length: plan.totalWeeks }, (_, i) => i + 1);
  const shown = plan.workouts.filter((w) => w.week === week);
  const blockIndex = plan.blocks.length > 0 ? Math.min(Math.floor((week - 1) / BLOCK_WEEKS), plan.blocks.length - 1) : -1;
  const block = blockIndex >= 0 ? plan.blocks[blockIndex] : null;
  const isDeload = plan.generated && week % BLOCK_WEEKS === 0;

  return (
    <div className="min-w-0">
      {/* Block timeline */}
      {plan.blocks.length > 0 && (
        <div className="rise rise-1 mb-6 flex gap-2">
          {plan.blocks.map((b, i) => {
            const startWeek = i * BLOCK_WEEKS + 1;
            const endWeek = startWeek + BLOCK_WEEKS - 1;
            const state = plan.currentWeek > endWeek ? "done" : plan.currentWeek >= startWeek ? "now" : "later";
            const fill = state === "done" ? 100 : state === "now" ? ((plan.currentWeek - startWeek) / BLOCK_WEEKS) * 100 + 12 : 0;
            return (
              <button key={b.name} type="button" onClick={() => setWeek(Math.max(startWeek, Math.min(plan.currentWeek, endWeek)))} className="press flex-1 text-left">
                <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full bg-signal transition-[width] duration-700" style={{ width: `${Math.min(fill, 100)}%` }} />
                </div>
                <p className={cn("mt-2 text-sm font-semibold", blockIndex === i ? "text-ink" : "text-ink-mute")}>{b.name}</p>
                <p className="text-xs text-ink-mute">
                  Weeks {startWeek}–{endWeek}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Week picker */}
      <div className="no-scrollbar rise rise-2 relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Week">
        {weeks.map((n) => {
          const ws = plan.workouts.filter((w) => w.week === n);
          const done = ws.length > 0 && ws.every((w) => w.status === "LOGGED" || w.status === "SKIPPED");
          const selected = n === week;
          return (
            <button
              key={n}
              ref={n === plan.currentWeek ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setWeek(n)}
              className={cn(
                "press relative flex h-[58px] w-[50px] shrink-0 flex-col items-center justify-center rounded-xl border text-center",
                selected ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/20"
              )}
            >
              <span className={cn("text-[10px] font-medium uppercase tracking-wide", selected ? "text-white/60" : "text-ink-mute")}>Wk</span>
              <span className="text-lg font-semibold leading-tight">{n}</span>
              {done ? (
                <span className={cn("absolute bottom-1.5 h-1 w-1 rounded-full", selected ? "bg-white" : "bg-signal")} />
              ) : n === plan.currentWeek ? (
                <span className={cn("absolute bottom-1.5 h-1 w-3 rounded-full", selected ? "bg-white" : "bg-signal")} />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-3">
        <h2 className="text-2xl text-ink">
          Week {week}
          {week === plan.currentWeek && <span className="ml-2 align-middle text-sm font-medium text-signal">current</span>}
        </h2>
        {block && <p className="truncate text-sm text-ink-mute">{isDeload ? "Lighter week — recover" : block.focus}</p>}
      </div>

      <div key={week} className="fade-in mt-3 space-y-3">
        {shown.map((w) => (
          <WorkoutCard key={w.id} w={w} isNext={w.id === plan.nextUp?.id} open={openId === w.id} onToggle={() => setOpenId(openId === w.id ? null : w.id)} actions={actions} startLabel={startLabel} workoutHref={workoutBase ? (id) => (workoutBase.endsWith("=") ? `${workoutBase}${id}` : `${workoutBase}/${id}`) : undefined} />
        ))}
        {shown.length === 0 && <p className="py-4 text-center text-[15px] text-ink-mute">Nothing scheduled this week yet.</p>}
        <AddWorkout week={week} workouts={shown} actions={actions} />
      </div>

      <div className="rule mt-8 pt-6">
        <NoteField key={plan.id} label={noteLabel} value={plan.note} placeholder="Anything about the plan as a whole: what it's for, what to watch, when to revisit it." onSave={actions.setPlanNote} />
      </div>
    </div>
  );
}
