"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { DayInput } from "@/components/ui/day-input";
import { startGoal } from "@/lib/actions/goals";
import { dayFrom } from "@/lib/day-field";
import { addDays } from "@/lib/goals/days";
import { needsConfirmation, previewStart } from "@/lib/goals/preview";
import { AccentTitle } from "./GoalStrip";

type Template = { key: string; name: string; blurb: string; /** Who made the challenge. */ credit: string; length: number; /** What the diet says unless the person writes their own. */ diet: string };

/**
 * Start a goal. What matters is on screen first: which day number today would be (big, like the card's),
 * and a Start button. The start day and the diet's wording are there if wanted, closed otherwise. The rules
 * are the challenge's own and are not offered for change: the diet's wording is the one thing written here.
 * Starting today is one tap; starting on an earlier day asks first, because that counts days as done.
 *
 * The start day is read from the field at the moment of the tap, and the day number the person was shown is
 * sent with it: the server refuses if they disagree (lib/day-field.ts, confirmStart).
 * Dusk styling (app/dusk.css). Must sit inside `.dusk`.
 */
export function StartGoalForm({ template, today }: { template: Template; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [startDay, setStartDay] = useState(today);
  const [diet, setDiet] = useState(template.diet);
  const [showDay, setShowDay] = useState(false);
  const [showDiet, setShowDiet] = useState(false);
  /** Set when a back-dated start is waiting for a yes: the day the person is being asked about. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const dayRef = useRef<HTMLInputElement>(null);

  const preview = previewStart(startDay, today, template.length);
  const canStart = preview.ok && !pending;

  const send = (day: string, shownDay: number) =>
    startTransition(async () => {
      // The day the field shows, and the day number that was shown: the server refuses if they disagree.
      const r = await startGoal({ templateKey: template.key, startDay: day, shownDay, diet }).catch(() => ({ ok: false as const, error: "Couldn't start it." }));
      if (!r.ok) {
        setConfirming(null);
        return void toast.error(r.error);
      }
      toast.success(`${template.name} started · Day ${r.dayOfGoal}`);
      router.push("/today");
    });

  const begin = () => {
    const day = dayFrom(dayRef, startDay);
    if (day !== startDay) setStartDay(day);
    const p = previewStart(day, today, template.length);
    if (!p.ok) return void toast.error(p.error);
    if (needsConfirmation(p)) {
      setShowDay(false); // the day is on screen above; the field itself stays mounted, so its value can still be read
      return setConfirming(day);
    }
    send(day, p.dayOfGoal);
  };

  const confirmed = confirming != null ? previewStart(confirming, today, template.length) : null;

  return (
    <section className="dusk dusk-card sm:p-8">
      <h2 className="dusk-title">
        <AccentTitle name={template.name} />
      </h2>
      <p className="dusk-eyebrow mt-2">{template.credit}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-dusk-soft">{template.blurb}</p>

      {/* The day number: the one thing to check before starting. */}
      <div className="mt-6" aria-live="polite">
        <div className="flex items-end gap-3">
          <p className="dusk-counter" aria-label={preview.ok ? `Day ${preview.dayOfGoal} of ${template.length}` : "No day"}>
            {preview.ok ? preview.dayOfGoal : "–"}
          </p>
          <div className="pb-1" aria-hidden>
            <p className="dusk-eyebrow">Today is day</p>
            <p className="dusk-counter-of">of {template.length}</p>
          </div>
        </div>
        {/* Room for three lines, so the buttons below don't jump as the date changes. */}
        <div className="mt-3 min-h-[4.25rem] text-[14px] leading-relaxed">
          {preview.ok ? (
            preview.carriedDays > 0 ? (
              <p className="text-dusk-soft">
                {preview.carriedDays} day{preview.carriedDays === 1 ? "" : "s"}, {format(parseISO(startDay), "MMM d")} through {format(parseISO(addDays(today, -1)), "MMM d")}, happened before Atlas and count as done.
              </p>
            ) : (
              <p className="text-dusk-soft">Starting today. Workouts and ticks are checked from now on.</p>
            )
          ) : (
            <p className="text-dusk-peach">{preview.error}</p>
          )}
        </div>
      </div>

      {/* Closed unless wanted. The day field stays mounted either way, so its value can be read at the tap. */}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          aria-expanded={showDay}
          onClick={() => {
            setShowDay(!showDay);
            setConfirming(null);
          }}
          className="dusk-chip"
        >
          {startDay === today ? "Started earlier?" : `Started ${format(parseISO(startDay), "MMM d")}`} <ChevronDown className={showDay ? "h-4 w-4 rotate-180" : "h-4 w-4"} />
        </button>
        <button type="button" aria-expanded={showDiet} onClick={() => setShowDiet(!showDiet)} className="dusk-chip">
          Your diet <ChevronDown className={showDiet ? "h-4 w-4 rotate-180" : "h-4 w-4"} />
        </button>
      </div>

      <div hidden={!showDay} className="mt-3">
        <label className="dusk-eyebrow block" htmlFor="start-day">
          Start day
        </label>
        <DayInput
          ref={dayRef}
          id="start-day"
          value={startDay}
          max={today}
          onDay={(day) => {
            setStartDay(day);
            setConfirming(null);
          }}
          className="dusk-input mt-2 text-[15px]"
        />
      </div>

      {showDiet && (
        <div className="mt-3">
          <label className="dusk-eyebrow block" htmlFor="start-diet">
            Diet
          </label>
          <input id="start-diet" value={diet} onChange={(e) => setDiet(e.target.value)} maxLength={120} placeholder={template.diet} className="dusk-input mt-2 w-full text-[15px]" />
          <p className="mt-2 text-[13px] text-dusk-mute">What you are following. You can change it later.</p>
        </div>
      )}

      {confirmed && confirmed.ok ? (
        <div className="dusk-panel mt-5" role="alertdialog" aria-label="Confirm the start day">
          <p className="text-[16px] font-medium text-dusk-text">
            Start {template.name} at Day {confirmed.dayOfGoal}?
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-dusk-soft">
            The {confirmed.carriedDays} day{confirmed.carriedDays === 1 ? "" : "s"} before today count as done and show as “before Atlas”.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => send(confirming as string, confirmed.dayOfGoal)} className="dusk-button">
              {pending ? "Starting…" : `Start at Day ${confirmed.dayOfGoal}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(null);
                setShowDay(true);
              }}
              className="dusk-chip"
            >
              Change the day
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!canStart} onClick={begin} className="dusk-button mt-5 min-h-[56px] w-full text-[16px]">
          {pending ? "Starting…" : `Start ${template.name}`}
        </button>
      )}
    </section>
  );
}
