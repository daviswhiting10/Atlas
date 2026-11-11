import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ImageUp, Lightbulb, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ROSTER } from "@/lib/db/roster";
import { StatRow } from "@/components/athlete/StatRow";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Programs" };

const DAY_MS = 86_400_000;

/**
 * Programs: the plans clients are on (and drafts waiting to be assigned),
 * then the library of programs written by hand. Every plan opens in the
 * same editor the athlete's Plan screen uses.
 */
export default async function ProgramsPage() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  const [plans, library] = await Promise.all([
    prisma.programAssignment.findMany({
      where: { workspaceId, status: { in: ["ACTIVE", "PAUSED"] }, client: { deletedAt: null, ...ROSTER } },
      orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        client: { select: { id: true, fullName: true } },
        assignedWorkouts: { select: { status: true, scheduledDate: true } },
      },
    }),
    prisma.program.findMany({
      where: { workspaceId, deletedAt: null, isTemplate: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, description: true, durationWeeks: true, goalTags: true, _count: { select: { assignments: true } }, blocks: { select: { _count: { select: { workouts: true } } } } },
    }),
  ]);

  const drafts = plans.filter((p) => p.status === "PAUSED");
  const live = plans.filter((p) => p.status === "ACTIVE");

  const progressOf = (p: (typeof plans)[number]) => {
    const total = p.assignedWorkouts.length;
    const done = p.assignedWorkouts.filter((w) => w.status === "LOGGED").length;
    const weeks = p.assignedWorkouts.reduce((m, w) => Math.max(m, Math.floor(Math.round((w.scheduledDate.getTime() - p.startDate.getTime()) / DAY_MS) / 7) + 1), 1);
    return { total, done, weeks };
  };

  return (
    <div className="space-y-10">
      <div className="rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl leading-none text-ink">Programs</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Generate a plan for a client, edit it the way they&apos;ll see it, then assign it.
          </p>
        </div>
        <Link href="/programs/new" className="press flex h-11 shrink-0 items-center gap-2 self-start rounded-xl bg-ink px-5 text-[15px] font-semibold text-white hover:bg-ink/85 sm:self-auto">
          <Plus className="h-4 w-4" /> New plan
        </Link>
      </div>

      <StatRow
        className="rise rise-1"
        stats={[
          { label: "Live plans", value: String(live.length) },
          { label: "Drafts", value: String(drafts.length), hint: drafts.length > 0 ? "waiting to be assigned" : undefined },
          { label: "Library", value: String(library.length), hint: "hand-built programs" },
        ]}
      />

      {/* ── Client plans ─────────────────────────────────────────────── */}
      <section className="rise rise-2">
        <h2 className="text-xl text-ink">Client plans</h2>
        {plans.length === 0 ? (
          <p className="rule mt-3 pt-4 text-[15px] text-ink-soft">No client is on a plan yet. Start with “New plan”.</p>
        ) : (
          <ul className="rule mt-3 divide-y divide-line">
            {[...drafts, ...live].map((p) => {
              const { total, done, weeks } = progressOf(p);
              return (
                <li key={p.id}>
                  <Link href={`/clients/${p.client.id}/programs/${p.id}`} className="press group flex items-center gap-4 py-3.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">{p.client.fullName.charAt(0)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-ink">{p.client.fullName}</span>
                        {p.status === "PAUSED" && <span className="shrink-0 rounded-full border border-line bg-white px-2 py-0.5 text-[11px] font-medium text-ink-soft">Draft</span>}
                      </span>
                      <span className="block truncate text-[13px] text-ink-mute">
                        {p.name} · {weeks} weeks
                      </span>
                    </span>
                    <span className="hidden w-40 shrink-0 sm:block">
                      <span className="block h-1 overflow-hidden rounded-full bg-ink/10">
                        <span className={cn("block h-full rounded-full", p.status === "PAUSED" ? "bg-ink/20" : "bg-signal")} style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
                      </span>
                      <span className="mt-1 block text-right text-xs text-ink-mute">{p.status === "PAUSED" ? "Not assigned" : `${done} of ${total} logged`}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-mute transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Library ──────────────────────────────────────────────────── */}
      <section className="rise rise-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-xl text-ink">Library</h2>
            <p className="mt-0.5 text-sm text-ink-mute">Programs written by hand. Use one as written for a client, or generate a plan from its goals.</p>
          </div>
          <div className="flex gap-1">
            <Link href="/programs/import" className="press flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-ink/5 hover:text-ink">
              <ImageUp className="h-4 w-4" /> Import from photos
            </Link>
            <Link href="/programs/idea" className="press flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-ink/5 hover:text-ink">
              <Lightbulb className="h-4 w-4" /> Program idea
            </Link>
          </div>
        </div>
        {library.length === 0 ? (
          <p className="rule mt-3 pt-4 text-[15px] text-ink-soft">No library programs.</p>
        ) : (
          <ul className="rule mt-3 divide-y divide-line">
            {library.map((p) => {
              const tags = (p.goalTags as { goals?: string[]; conditions?: string[] } | null) ?? {};
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
                    <span className="hidden flex-wrap justify-end gap-1 md:flex">
                      {[...(tags.goals ?? []), ...(tags.conditions ?? [])].slice(0, 3).map((t) => (
                        <span key={t} className="rounded-full border border-line bg-white px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                          {t}
                        </span>
                      ))}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-mute transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
