import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../lib/db/client";

const METHODOLOGY_DIR = path.join(process.cwd(), "methodology");
const WORKSPACE_ID = process.env.SEED_WORKSPACE_ID ?? "ws_atlas_primary";

function parseFrontmatter(raw: string): {
  slug: string;
  title: string;
  appliesTo: string[];
  body: string;
} {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return { slug: "", title: "", appliesTo: [], body: raw };

  const fm = fmMatch[1];
  const body = fmMatch[2].trim();

  const titleMatch = fm.match(/^title:\s*(.+)$/m);
  const slugMatch = fm.match(/^slug:\s*(.+)$/m);
  const appliesToMatch = fm.match(/^appliesTo:\s*\[(.+)\]$/m);

  return {
    slug: slugMatch?.[1]?.trim() ?? "",
    title: titleMatch?.[1]?.trim() ?? "",
    appliesTo: appliesToMatch
      ? appliesToMatch[1].split(",").map((s) => s.trim().replace(/['"]/g, ""))
      : [],
    body,
  };
}

async function main() {
  if (!fs.existsSync(METHODOLOGY_DIR)) {
    console.log("No /methodology directory found — skipping.");
    return;
  }

  const files = fs
    .readdirSync(METHODOLOGY_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    console.log("No .md files found in /methodology — skipping.");
    return;
  }

  let seeded = 0;
  let skipped = 0;

  for (const filename of files) {
    const raw = fs.readFileSync(path.join(METHODOLOGY_DIR, filename), "utf-8");
    const { slug: fmSlug, title, appliesTo, body } = parseFrontmatter(raw);

    const stripped = body.replace(/<!--[\s\S]*?-->/g, "").trim();
    if (!stripped) {
      console.log(`  skip (empty): ${filename}`);
      skipped++;
      continue;
    }

    const slug = fmSlug || filename.replace(/\.md$/, "");
    const hash = crypto.createHash("sha256").update(raw).digest("hex");

    await prisma.methodologyDocument.upsert({
      where: { workspaceId_slug: { workspaceId: WORKSPACE_ID, slug } },
      update: {
        content: body,
        title: title || slug,
        appliesTo,
        hash,
        version: { increment: 1 },
      },
      create: {
        workspaceId: WORKSPACE_ID,
        slug,
        title: title || slug,
        appliesTo,
        content: body,
        hash,
        version: 1,
      },
    });

    console.log(`  ok  [${slug}] "${title || slug}"`);
    seeded++;
  }

  console.log(
    `\nMethodology: ${seeded} seeded, ${skipped} skipped (empty placeholders).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("seed:methodology failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
