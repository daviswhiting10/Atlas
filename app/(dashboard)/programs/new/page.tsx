import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ROSTER } from "@/lib/db/roster";
import { NewPlanChooser } from "@/components/coach/NewPlanChooser";

export const metadata: Metadata = { title: "New plan" };

export default async function NewPlanPage({ searchParams }: { searchParams: { client?: string; from?: string } }) {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  const [clients, template] = await Promise.all([
    prisma.clientProfile.findMany({ where: { workspaceId, deletedAt: null, ...ROSTER }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, primaryGoal: true } }),
    searchParams.from ? prisma.program.findFirst({ where: { id: searchParams.from, workspaceId, deletedAt: null }, select: { name: true, goalTags: true } }) : null,
  ]);
  const tags = (template?.goalTags as { goals?: string[]; conditions?: string[] } | null) ?? null;

  return (
    <div>
      <Link href="/programs" className="press -ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Programs
      </Link>
      <div className="rise mb-8 mt-3">
        <h1 className="text-4xl leading-none text-ink">New plan</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          {template ? `Starting from the goals of “${template.name}”. ` : ""}Upload your own, or have Atlas build one. Either way you check it before it’s assigned.
        </p>
      </div>
      <NewPlanChooser
        clients={clients}
        initialClientId={clients.some((c) => c.id === searchParams.client) ? searchParams.client : undefined}
        initialTags={tags ? { goals: tags.goals ?? [], conditions: tags.conditions ?? [] } : undefined}
        initialMode={template ? "build" : "upload"}
      />
    </div>
  );
}
