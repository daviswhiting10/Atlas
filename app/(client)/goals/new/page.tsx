import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StartGoalForm } from "@/components/goals/StartGoalForm";
import { TZ_COOKIE, getAthlete } from "@/lib/athlete/data";
import { localDay, safeTimeZone } from "@/lib/athlete/sessions";
import { activeGoalId } from "@/lib/goals/data";
import { SEVENTY_FIVE_HARD } from "@/lib/goals/templates";

export const metadata: Metadata = { title: "Start a goal" };

export default async function NewGoalPage() {
  const athlete = await getAthlete();
  if (athlete.isGuest) redirect("/today");
  if (await activeGoalId(athlete.clientId)) redirect("/today");

  const today = localDay(new Date(), safeTimeZone(cookies().get(TZ_COOKIE)?.value));
  const t = SEVENTY_FIVE_HARD;
  return (
    <div className="mx-auto max-w-xl">
      <Link href="/today" className="press mb-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Today
      </Link>
      <h1 className="rise mb-6 text-4xl leading-none text-ink">Start a goal</h1>
      <p className="eyebrow mb-3">Challenges</p>
      <StartGoalForm template={{ key: t.key, name: t.name, blurb: t.blurb, length: t.rules.length.days, rules: t.rules.rules.map((r) => ({ key: r.key, label: r.label })) }} today={today} />
    </div>
  );
}
