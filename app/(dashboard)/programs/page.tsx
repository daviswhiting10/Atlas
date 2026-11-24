import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ImageUp } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ProgramLibrary } from "@/components/programs/ProgramLibrary";
import type { LibraryProgram } from "@/lib/programs/filter";

export const metadata: Metadata = { title: "Programs" };

/**
 * The program library: search, filters and categories (components/programs). A client's own plan lives on
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

  const programs: LibraryProgram[] = library.map((p) => ({ id: p.id, name: p.name, durationWeeks: p.durationWeeks, perWeek: p.blocks[0]?._count.workouts ?? 0, clients: p._count.assignments, goalTags: p.goalTags }));

  return (
    <div className="space-y-6">
      <div className="rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl leading-none text-ink">Programs</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Your library of reusable programs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/programs/import" className="press flex h-11 items-center gap-2 rounded-xl border border-line bg-paper px-4 text-sm font-semibold text-ink hover:border-ink/25">
            <ImageUp className="h-4 w-4" /> Import from photos
          </Link>
        </div>
      </div>

      {library.length === 0 ? (
        <p className="rule pt-4 text-[15px] text-ink-soft">No programs yet. Import one from photos of a written program to start your library.</p>
      ) : (
        <ProgramLibrary programs={programs} user={session?.user?.id ?? "me"} />
      )}
    </div>
  );
}
