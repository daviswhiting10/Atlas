import { prisma } from "@/lib/db/client";

/**
 * Load methodology documents from DB for the given workspace.
 * Optionally filter by appliesTo context (e.g. "program", "outreach").
 */
export async function loadMethodology(
  workspaceId: string,
  filterAppliesTo?: string
): Promise<string> {
  const docs = await prisma.methodologyDocument.findMany({
    where: { workspaceId },
    orderBy: { slug: "asc" },
  });

  const filtered = filterAppliesTo
    ? docs.filter((d) => {
        const appliesTo = d.appliesTo as string[];
        return appliesTo.length === 0 || appliesTo.includes(filterAppliesTo);
      })
    : docs;

  if (filtered.length === 0) return "";

  return filtered
    .map((d) => `### ${d.title || d.slug}\n\n${d.content}`)
    .join("\n\n---\n\n");
}

/**
 * Retrieve a single methodology document by slug.
 */
export async function getMethodology(
  workspaceId: string,
  slug: string
): Promise<string | null> {
  const doc = await prisma.methodologyDocument.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
  });
  return doc?.content ?? null;
}
