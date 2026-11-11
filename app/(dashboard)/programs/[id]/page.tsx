import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ROSTER } from "@/lib/db/roster";
import { getProgram } from "@/lib/db/programs";
import { displayName } from "@/lib/plan/catalog";
import { repLabel } from "@/lib/plan/overview";
import { TemplateActions } from "@/components/coach/TemplateActions";

export const metadata: Metadata = { title: "Library program" };

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A program from the coach's library, shown the way plans are shown everywhere else. */
export default async function LibraryProgramPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  const [program, clients, assigned] = await Promise.all([
    getProgram(params.id, workspaceId),
    prisma.clientProfile.findMany({ where: { workspaceId, deletedAt: null, ...ROSTER }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    prisma.programAssignment.count({ where: { sourceProgramId: params.id, workspaceId } }),
  ]);
  if (!program) notFound();

  const tags = (program.goalTags as { goals?: string[]; conditions?: string[] } | null) ?? {};
  const chips = [...(tags.goals ?? []), ...(tags.conditions ?? [])];

  return (
    <div>
      <Link href="/programs" className="press -ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Programs
      </Link>

      <div className="rise mb-7 mt-3">
        <p className="eyebrow">Library program · {program.durationWeeks} week{program.durationWeeks === 1 ? "" : "s"}</p>
        <h1 className="mt-1.5 text-[34px] leading-[1.08] text-ink sm:text-[42px]">{program.name}</h1>
        {program.description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{program.description}</p>}
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c} className="rounded-full border border-line bg-white px-3 py-1 text-[13px] font-medium text-ink-soft">
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <div className="space-y-8">
          {program.blocks.map((block) => (
            <section key={block.id}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl text-ink">{block.name}</h2>
                <span className="text-sm text-ink-mute">
                  {block.weeks} week{block.weeks === 1 ? "" : "s"} · repeats weekly
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {block.workouts.map((w) => (
                  <div key={w.id} className="surface p-4 sm:p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-base font-semibold text-ink">{w.name}</p>
                      {w.dayOfWeek && <span className="text-[13px] text-ink-mute">{DAY[w.dayOfWeek]}</span>}
                    </div>
                    <ol className="mt-2 divide-y divide-line">
                      {w.exercises.map((e, i) => {
                        const sets = (e.prescribedSets as Array<{ repMin?: number; repMax?: number; unit?: "reps" | "secs" }>) ?? [];
                        return (
                          <li key={e.id} className="flex items-baseline gap-3 py-2 text-[15px]">
                            <span className="w-4 shrink-0 text-[13px] text-ink-mute">{i + 1}</span>
                            <span className="min-w-0 flex-1 truncate text-ink">{displayName(null, e.exercise.name)}</span>
                            {e.section && <span className="hidden shrink-0 text-xs text-ink-mute sm:block">{e.section}</span>}
                            <span className="shrink-0 text-ink-soft">
                              {sets.length} × {repLabel(sets)}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ))}
                {block.workouts.length === 0 && <p className="text-[15px] text-ink-mute">No workouts in this block.</p>}
              </div>
            </section>
          ))}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <TemplateActions programId={program.id} clients={clients} assigned={assigned} />
        </aside>
      </div>
    </div>
  );
}
