import fs from "fs";
import path from "path";
import crypto from "crypto";

const METHODOLOGY_DIR = path.join(process.cwd(), "methodology");

type MethodologyFile = {
  filename: string;
  title: string;
  appliesTo: string[];
  content: string;
};

// In-memory cache: { hash → parsed files }
let cache: { hash: string; files: MethodologyFile[] } | null = null;

function getDirectoryHash(): string {
  const files = fs
    .readdirSync(METHODOLOGY_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  const combined = files
    .map((f) => {
      const content = fs.readFileSync(path.join(METHODOLOGY_DIR, f), "utf-8");
      return `${f}:${content}`;
    })
    .join("\n---\n");

  return crypto.createHash("sha256").update(combined).digest("hex");
}

function parseFrontmatter(raw: string): {
  title: string;
  appliesTo: string[];
  body: string;
} {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return { title: "", appliesTo: [], body: raw };

  const fm = fmMatch[1];
  const body = fmMatch[2].trim();

  const titleMatch = fm.match(/^title:\s*(.+)$/m);
  const appliesToMatch = fm.match(/^appliesTo:\s*\[(.+)\]$/m);

  const title = titleMatch ? titleMatch[1].trim() : "";
  const appliesTo = appliesToMatch
    ? appliesToMatch[1].split(",").map((s) => s.trim().replace(/['"]/g, ""))
    : [];

  return { title, appliesTo, body };
}

function loadFiles(): MethodologyFile[] {
  if (!fs.existsSync(METHODOLOGY_DIR)) return [];

  const files = fs
    .readdirSync(METHODOLOGY_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  const result: MethodologyFile[] = [];

  for (const filename of files) {
    const raw = fs.readFileSync(path.join(METHODOLOGY_DIR, filename), "utf-8");
    const { title, appliesTo, body } = parseFrontmatter(raw);

    // Skip files that are empty or only contain the placeholder comment
    const stripped = body.replace(/<!--[\s\S]*?-->/g, "").trim();
    if (!stripped) continue;

    result.push({ filename, title, appliesTo, content: body });
  }

  return result;
}

/**
 * Returns methodology content filtered by context.
 * @param filterAppliesTo - if provided, only include files that list this context (or have no appliesTo filter)
 */
export function loadMethodology(filterAppliesTo?: string): string {
  if (!fs.existsSync(METHODOLOGY_DIR)) return "";

  const currentHash = getDirectoryHash();

  if (!cache || cache.hash !== currentHash) {
    cache = { hash: currentHash, files: loadFiles() };
  }

  const { files } = cache;

  const filtered =
    filterAppliesTo
      ? files.filter(
          (f) => f.appliesTo.length === 0 || f.appliesTo.includes(filterAppliesTo)
        )
      : files;

  if (filtered.length === 0) return "";

  return filtered
    .map((f) => `### ${f.title || f.filename}\n\n${f.content}`)
    .join("\n\n---\n\n");
}

/**
 * Returns the current hash of the methodology folder.
 * Stored on the Trainer record for cache-busting.
 */
export function getMethodologyHash(): string {
  if (!fs.existsSync(METHODOLOGY_DIR)) return "";
  return getDirectoryHash();
}
