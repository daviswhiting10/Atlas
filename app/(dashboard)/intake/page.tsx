import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ROSTER } from "@/lib/db/roster";
import { CATEGORIES, UNCATEGORIZED, categoryLabel, categoryOf } from "@/lib/programs/categories";
import { IntakeForm } from "./IntakeForm";

export const metadata: Metadata = { title: "Intake" };

export default async function IntakePage({ searchParams }: { searchParams: { clientId?: string } }) {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  const [clients, library] = await Promise.all([
    prisma.clientProfile.findMany({ where: { workspaceId, deletedAt: null, ...ROSTER }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    prisma.program.findMany({ where: { workspaceId, deletedAt: null, isTemplate: true }, orderBy: { name: "asc" }, select: { id: true, name: true, durationWeeks: true, goalTags: true } }),
  ]);

  const programs = library.map((p) => {
    const cat = categoryOf(p.goalTags);
    return { id: p.id, name: p.name, weeks: p.durationWeeks, category: cat ? categoryLabel(cat) : UNCATEGORIZED, tag: cat };
  });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rise mb-8">
        <h1 className="text-4xl leading-none text-ink">Intake</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">Tag the goal, write what you learned, and give them a program.</p>
      </div>
      <IntakeForm
        clients={clients}
        programs={programs}
        categories={CATEGORIES.map((c) => ({ tag: c.tag, label: c.label }))}
        initialClientId={clients.some((c) => c.id === searchParams.clientId) ? searchParams.clientId! : ""}
      />
    </div>
  );
}
