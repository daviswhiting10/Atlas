"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { SessionSummary } from "@/lib/actions/athlete";
import { SheetLock } from "@/components/ui/sheet-lock";
import { canMoveTo, type Slot } from "@/lib/sessions/reassign";
import { cn } from "@/lib/utils";
import { useEscape } from "@/hooks/use-escape";

type Load = (id: string) => Promise<SessionSummary | null>;
export type Remove = (raw: { workoutLogId: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
export type ChangeDate = (raw: { workoutLogId: string; day: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
export type Move = (raw: { workoutLogId: string; toAssignedWorkoutId: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
export type SlotWeek = { week: number; slots: Slot[] };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * A logged day on the Plan calendar: a small summary of the session (what it was, how many sets, how long, the notes) with
 * a way to open it and, when `remove` is given, a red Delete session that asks first. Deleting takes the session, its sets
 * and its notes away, and the day goes back to scheduled.
 */
export function SessionMini({ logId, href, load, remove, move, weeks, loadWeeks, actionsOnly = false, onChanged, changeDate, day }: { logId: string; href: string; load?: Load; /** Change the calendar day it was done on (not its plan day). `day` is the day it is on now. */ changeDate?: ChangeDate; day?: string; remove?: Remove; /** Move it to another day of the plan (with the plan's days to choose from). */ move?: Move; weeks?: SlotWeek[]; /** History doesn't carry the plan: fetch its days when Reassign is tapped. */ loadWeeks?: (logId: string) => Promise<SlotWeek[]>; /** Only the buttons (History's sheet already shows the sets and notes): no summary, no View session. */ actionsOnly?: boolean; /** After a delete or a move went through (the History sheet closes itself). */ onChanged?: () => void }) {
  const router = useRouter();
  const [s, setS] = useState<SessionSummary | null | "loading">("loading");
  const [asking, setAsking] = useState(false);
  const [moving, setMoving] = useState(false);
  const [dating, setDating] = useState(false);
  const [fetchedWeeks, setFetchedWeeks] = useState<SlotWeek[] | null>(null);
  const openMove = () => {
    if (weeks || fetchedWeeks) return void setMoving(true);
    loadWeeks?.(logId).then((w) => { setFetchedWeeks(w); setMoving(true); }, () => toast.error("Couldn't load your plan's days."));
  };
  const [pending, start] = useTransition();
  useEffect(() => {
    if (actionsOnly || !load) return;
    let live = true;
    setS("loading");
    load(logId)
      .then((r) => live && setS(r))
      .catch(() => live && setS(null));
    return () => {
      live = false;
    };
  }, [load, logId, actionsOnly]);

  const facts = s && s !== "loading" ? [s.setCount != null ? plural(s.setCount, "set") : null, s.minutes ? `${s.minutes} min` : null].filter(Boolean).join(" · ") : "";
  const confirm = () =>
    start(async () => {
      const r = await remove!({ workoutLogId: logId });
      if (!r.ok) return void toast.error(r.error);
      setAsking(false);
      toast.success("Session deleted");
      router.refresh();
      onChanged?.();
    });

  return (
    <div>
      {actionsOnly ? null : s === "loading" ? <div className="mt-3 h-14" aria-busy /> : facts ? <p className="mt-0.5 text-[13px] text-ink-mute">{facts}</p> : null}
      {!actionsOnly && s && s !== "loading" && (s.notes ?? []).length > 0 && (
        <div className="mt-3 space-y-1.5 rounded-xl border border-line px-3 py-2 text-[14px] leading-snug text-ink-soft">
          {(s.notes ?? []).map((n) => (
            <p key={n.label}>
              <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink">{n.label}</span>
              {n.text}
            </p>
          ))}
        </div>
      )}
      <div className="mt-3.5 flex flex-col gap-2">
        {!actionsOnly && (
          <Link href={href} className="press flex h-[52px] w-full items-center justify-center rounded-2xl border border-line-strong text-[17px] font-semibold text-ink">
            View session
          </Link>
        )}
        {changeDate && day && (
          <button type="button" onClick={() => setDating(true)} className="press flex h-[52px] w-full items-center justify-center rounded-2xl border border-line-strong text-[16px] font-semibold text-ink">
            Change date
          </button>
        )}
        {move && (weeks || loadWeeks) && (
          <button type="button" onClick={openMove} className="press flex h-[52px] w-full items-center justify-center rounded-2xl border border-line-strong text-[16px] font-semibold text-ink">
            Reassign plan day
          </button>
        )}
        {remove && (
          <button type="button" onClick={() => setAsking(true)} className="press flex h-[52px] w-full items-center justify-center rounded-2xl border border-destructive/60 bg-destructive/10 text-[16px] font-semibold text-destructive">
            Delete session
          </button>
        )}
      </div>
      {moving && move && (weeks ?? fetchedWeeks) && <ReassignSheet weeks={(weeks ?? fetchedWeeks)!} onClose={() => setMoving(false)} onMove={(to) => move({ workoutLogId: logId, toAssignedWorkoutId: to })} onDone={() => { setMoving(false); toast.success("Session moved"); router.refresh(); onChanged?.(); }} />}
      {dating && changeDate && day && <DateSheet day={day} onClose={() => setDating(false)} onSave={(d) => changeDate({ workoutLogId: logId, day: d })} onDone={() => { setDating(false); toast.success("Date changed"); router.refresh(); onChanged?.(); }} />}
      {asking && <ConfirmDelete pending={pending} onCancel={() => !pending && setAsking(false)} onConfirm={confirm} />}
    </div>
  );
}

/** Pick the calendar day the session was really done. Its plan day stays; only the date moves. */
function DateSheet({ day, onClose, onSave, onDone }: { day: string; onClose: () => void; onSave: (day: string) => Promise<{ ok: true } | { ok: false; error: string }>; onDone: () => void }) {
  useEscape(true, onClose);
  const [picked, setPicked] = useState(day);
  const [pending, start] = useTransition();
  const [today] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  });
  const go = () =>
    start(async () => {
      const r = await onSave(picked);
      if (!r.ok) return void toast.error(r.error);
      onDone();
    });
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={() => !pending && onClose()}>
      <SheetLock />
      <div role="dialog" aria-modal="true" aria-label="Change date" onClick={(e) => e.stopPropagation()} className="sheet-up w-full max-w-md rounded-t-[28px] bg-bone p-5 sm:rounded-[28px]" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        <h2 className="text-[22px] font-semibold text-ink">Change date</h2>
        <p className="mt-1 text-[14px] text-ink-mute">The day you did it. Its plan day, sets and notes stay as they are.</p>
        <input
          type="date"
          value={picked}
          max={today}
          min="2000-01-01"
          onChange={(e) => setPicked(e.target.value)}
          aria-label="Date"
          className="mt-4 h-[52px] w-full rounded-2xl border border-line-strong bg-dusk-raised px-4 text-[17px] text-ink"
        />
        <button type="button" onClick={go} disabled={pending || !picked || picked === day} className="press mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-dusk-button text-[16px] font-semibold text-dusk-button-text disabled:opacity-40">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} {picked && picked !== day ? `Move to ${dayLabel(picked)}` : "Choose a new date"}
        </button>
        <button type="button" onClick={onClose} disabled={pending} className="press mt-1 flex h-12 w-full items-center justify-center text-[15px] font-semibold text-ink-soft">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ConfirmDelete({ pending, onCancel, onConfirm }: { pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  useEscape(true, onCancel);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={onCancel}>
      <SheetLock />
      <div role="dialog" aria-modal="true" aria-label="Delete this session?" onClick={(e) => e.stopPropagation()} className="sheet-up w-full max-w-md rounded-t-[28px] bg-bone p-5 sm:rounded-[28px]" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        <h2 className="text-[22px] font-semibold text-ink">Delete this session?</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">Sets you logged will be removed. This can&apos;t be undone.</p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={onConfirm} disabled={pending} className="press flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-destructive text-[16px] font-semibold text-white disabled:opacity-60">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Delete session
          </button>
          <button type="button" onClick={onCancel} disabled={pending} className="press flex h-12 items-center justify-center rounded-2xl text-[16px] font-semibold text-ink">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Where to move the session: the plan's weeks and days. A day that already has a session is ticked and can't be picked. */
function ReassignSheet({ weeks, onClose, onMove, onDone }: { weeks: SlotWeek[]; onClose: () => void; onMove: (to: string) => Promise<{ ok: true } | { ok: false; error: string }>; onDone: () => void }) {
  useEscape(true, onClose);
  const [pick, setPick] = useState<Slot | null>(null);
  const [pending, start] = useTransition();
  const list = useRef<HTMLDivElement>(null);
  // Open on the weeks around where the session is now, not on week 1 of 12.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>("[data-here]")?.scrollIntoView({ block: "center" });
  }, []);
  const go = () =>
    start(async () => {
      if (!pick) return;
      const r = await onMove(pick.id);
      if (!r.ok) return void toast.error(r.error);
      onDone();
    });
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={() => !pending && onClose()}>
      <SheetLock />
      <div role="dialog" aria-modal="true" aria-label="Reassign to" onClick={(e) => e.stopPropagation()} className="sheet-up flex max-h-[80vh] w-full max-w-md flex-col rounded-t-[28px] bg-bone px-4 pt-4 sm:rounded-[28px]" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <h2 className="text-[22px] font-semibold text-ink">Reassign to…</h2>
        <p className="mt-1 text-[14px] text-ink-mute">Pick the day this session belongs to. It keeps the date you did it; its sets and notes go with it.</p>
        <div ref={list} className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {weeks.map((w) => (
            <section key={w.week} className="mb-3">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Week {w.week}</h3>
              <ul className="mt-1 divide-y divide-line border-y border-line">
                {w.slots.map((s) => {
                  const ok = canMoveTo(s);
                  return (
                    <li key={s.id}>
                      <button type="button" data-here={s.current ? "" : undefined} disabled={!ok} onClick={() => setPick(s)} aria-pressed={pick?.id === s.id} className={cn("press flex min-h-12 w-full items-center justify-between gap-3 px-1 text-left text-[15px]", ok ? "text-ink" : "text-ink-mute", pick?.id === s.id && "bg-signal/10")}>
                        <span className="min-w-0">
                          <span className="font-semibold">{s.name}</span>
                          <span className="ml-2 text-[13px] text-ink-mute">{dayLabel(s.date)}</span>
                        </span>
                        <span className="shrink-0 text-[13px]" aria-label={s.current ? "This session is here" : s.logged ? "Already logged" : undefined}>
                          {s.current ? "Here now" : s.logged ? "✓ Logged" : pick?.id === s.id ? "✓" : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        <button type="button" onClick={go} disabled={!pick || pending} className="press mt-2 flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-dusk-button text-[16px] font-semibold text-dusk-button-text disabled:opacity-50">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} {pick ? `Move to ${dayLabel(pick.date)}` : "Choose a day"}
        </button>
        <button type="button" onClick={onClose} disabled={pending} className="press mt-1 flex h-12 items-center justify-center text-[15px] font-semibold text-ink-soft">
          Cancel
        </button>
      </div>
    </div>
  );
}
