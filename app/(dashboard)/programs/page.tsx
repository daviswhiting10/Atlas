import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ImageUp, Lightbulb, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { CATEGORIES, UNCATEGORIZED, categoryLabel, categoryOf } from "@/lib/programs/categories";

export const metadata: Metadata = { title: "Programs" };

/**
 * The program library, grouped by category. A client's own plan lives on
 * their page; this is where reusable programs are kept.
 */
export default async function ProgramsPage() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  const library = await prisma.program.findMany({
    where: { workspaceId, deletedAt: null, isTemplate: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, durationWeeks: true, goalTags: true, _count: { select: { assignments: true } }, blocks: { select: { _count: { select: { workouts: true } } } } },
  });

  // Category order follows the list; anything without one goes last.
  const groups = [...CATEGORIES.map((c) => c.tag as string), UNCATEGORIZED]
    .map((tag) => ({ tag, programs: library.filter((p) => (categoryOf(p.goalTags) ?? UNCATEGORIZED) === tag) }))
    .filter((g) => g.programs.length > 0);

  return (
    <div className="space-y-10">
      <div className="rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl leading-none text-ink">Programs</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Your library, by category. {library.length} program{library.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/programs/import" className="press flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-ink/25">
            <ImageUp className="h-4 w-4" /> Import from photos
          </Link>
          <Link href="/programs/idea" className="press flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-ink/25">
            <Lightbulb className="h-4 w-4" /> Program idea
          </Link>
          <Link href="/programs/new" className="press flex h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/85">
            <Plus className="h-4 w-4" /> Plan for a client
          </Link>
        </div>
      </div>

      {library.length === 0 ? (
        <p className="rule pt-4 text-[15px] text-ink-soft">No programs yet. Import one from photos of a written program to start your library.</p>
      ) : (
        groups.map((g, i) => (
          <section key={g.tag} className={`rise rise-${Math.min(i + 1, 5)}`}>
            <h2 className="text-xl text-ink">
              {g.tag === UNCATEGORIZED ? "No category yet" : categoryLabel(g.tag)}
              <span className="ml-2 text-sm font-normal text-ink-mute">{g.programs.length}</span>
            </h2>
            {g.tag === UNCATEGORIZED && <p className="mt-0.5 text-sm text-ink-mute">Open a program to give it a category.</p>}
            <ul className="rule mt-3 divide-y divide-line">
              {g.programs.map((p) => {
                const perWeek = p.blocks[0]?._count.workouts ?? 0;
                return (
                  <li key={p.id}>
                    <Link href={`/programs/${p.id}`} className="press group flex items-center gap-4 py-3.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-ink">{p.name}</span>
                        <span className="block truncate text-[13px] text-ink-mute">
                          {p.durationWeeks} week{p.durationWeeks === 1 ? "" : "s"} · {perWeek} workout{perWeek === 1 ? "" : "s"} a week
                          {p._count.assignments > 0 ? ` · used for ${p._count.assignments} client${p._count.assignments === 1 ? "" : "s"}` : ""}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-ink-mute transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
