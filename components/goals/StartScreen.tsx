import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DEFAULT_DIET, SEVENTY_FIVE_HARD } from "@/lib/goals/templates";
import { StartGoalForm } from "./StartGoalForm";

/**
 * The Start a goal screen, from plain data: a way back, and the goal's card. There is no page title (the
 * card names the goal) and no section label; there is one goal to start today.
 */
export function StartScreen({ today }: { today: string }) {
  const t = SEVENTY_FIVE_HARD;
  return (
    <div className="dusk dusk-page mx-auto max-w-xl">
      <div className="dusk-backdrop" aria-hidden />
      <Link href="/today" className="dusk-chip is-quiet -ml-2 mb-3">
        <ArrowLeft className="h-4 w-4" /> Today
      </Link>
      <h1 className="sr-only">Start a goal</h1>
      <StartGoalForm template={{ key: t.key, name: t.name, blurb: t.blurb, credit: t.credit, length: t.rules.length.days, diet: DEFAULT_DIET }} today={today} />
    </div>
  );
}
