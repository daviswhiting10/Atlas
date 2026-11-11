import { prisma } from "@/lib/db/client";
import { UNCATEGORIZED, categoryLabel, categoryOf } from "./categories";

/** A workspace's library programs, labelled by category, for pickers. */
export async function libraryForPicker(workspaceId: string) {
  const programs = await prisma.program.findMany({
    where: { workspaceId, deletedAt: null, isTemplate: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, durationWeeks: true, goalTags: true },
  });
  return programs
    .map((p) => {
      const cat = categoryOf(p.goalTags);
      return { id: p.id, name: p.name, weeks: p.durationWeeks, category: cat ? categoryLabel(cat) : UNCATEGORIZED };
    })
    .sort((a, b) => Number(a.category === UNCATEGORIZED) - Number(b.category === UNCATEGORIZED) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}
