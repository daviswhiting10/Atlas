"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { CATEGORIES } from "@/lib/programs/categories";

const Category = z.enum(CATEGORIES.map((c) => c.tag) as [string, ...string[]]);

/** Put a library program in a category. Its other tags are kept. */
export async function setProgramCategory(programId: string, category: string): Promise<{ ok: boolean }> {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!session?.user?.id || !workspaceId || session.user.role === "CLIENT") return { ok: false };
  const tag = Category.safeParse(category);
  const id = z.string().min(1).max(64).safeParse(programId);
  if (!tag.success || !id.success) return { ok: false };

  const program = await prisma.program.findFirst({ where: { id: id.data, workspaceId, deletedAt: null }, select: { id: true, goalTags: true } });
  if (!program) return { ok: false };
  const current = (program.goalTags as { goals?: string[] } & Record<string, unknown> | null) ?? {};
  const others = (current.goals ?? []).filter((g) => g !== tag.data && !CATEGORIES.some((c) => c.tag === g));
  await prisma.program.update({ where: { id: program.id }, data: { goalTags: { ...current, goals: [tag.data, ...others] } } });
  revalidatePath("/programs");
  revalidatePath(`/programs/${program.id}`);
  return { ok: true };
}
