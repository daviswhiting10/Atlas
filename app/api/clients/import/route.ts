import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";
import { ROSTER } from "@/lib/db/roster";
import { MAX_ROWS, normalizeRow, planImport, summarize, type ColumnRole, type PlannedRow } from "@/lib/clients/import";
import { runImport, type ImportDb } from "@/lib/clients/import-run";

const Role = z.enum(["fullName", "firstName", "lastName", "email", "phone", "goal", "status", "lastContact", "keep", "ignore"]);
const Cell = z.string().max(5000);

// No workspaceId here, ever: it comes from the signed-in coach's session.
const Body = z.object({
  fileName: z.string().max(200).default("import.csv"),
  headers: z.array(z.string().max(200)).min(1).max(100),
  rows: z.array(z.array(Cell).max(100)).min(1).max(MAX_ROWS),
  mapping: z.array(Role).min(1).max(100),
  defaultStatus: z.enum(["PROSPECT", "ACTIVE", "AT_RISK", "CHURNED"]),
  choices: z.record(z.string().regex(/^\d+$/), z.enum(["merge", "create", "skip"])).default({}),
  dryRun: z.boolean().default(true),
});

/** What the preview shows for each row. */
function describe(p: PlannedRow) {
  if (p.action === "invalid") return { row: p.row, action: p.action, reason: p.reason };
  if (p.action === "skip_name_only") return { row: p.row, action: p.action, name: p.name };
  const c = p.client;
  return {
    row: c.row,
    action: p.action,
    name: c.fullName,
    email: c.email,
    phone: c.phone,
    goal: c.primaryGoal,
    status: c.status,
    details: Object.keys(c.details).length,
    warnings: c.warnings,
    ...("existing" in p && p.existing ? { existing: { id: p.existing.id, name: p.existing.fullName } } : {}),
    ...("matchedOn" in p ? { matchedOn: p.matchedOn } : {}),
    ...("reason" in p ? { reason: p.reason } : {}),
  };
}

export const POST = withWorkspace(async (req, { workspaceId }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That file couldn't be read. Check it's a CSV with a header row." }, { status: 400 });
  const { fileName, headers, rows, mapping, defaultStatus, choices, dryRun } = parsed.data;

  if (mapping.length !== headers.length) return NextResponse.json({ error: "Every column needs a mapping." }, { status: 400 });
  const has = (r: ColumnRole) => mapping.includes(r);
  if (!has("fullName") && !has("firstName") && !has("lastName")) {
    return NextResponse.json({ error: "Choose which column holds the client's name." }, { status: 400 });
  }
  for (const r of ["fullName", "firstName", "lastName", "email", "phone", "goal", "status", "lastContact"] as const) {
    if (mapping.filter((m) => m === r).length > 1) return NextResponse.json({ error: "Each field can come from one column only." }, { status: 400 });
  }

  // This coach's roster only: their own training profile and other workspaces are never compared or touched.
  const existing = await prisma.clientProfile.findMany({
    where: { workspaceId, deletedAt: null, ...ROSTER },
    select: { id: true, fullName: true, email: true, phone: true },
  });

  const outcomes = rows.map((cells, i) => normalizeRow(cells, headers, mapping, { defaultStatus }, i + 2));
  const plan = planImport(outcomes, existing, Object.fromEntries(Object.entries(choices).map(([k, v]) => [Number(k), v])));
  const summary = summarize(plan);

  if (dryRun) return NextResponse.json({ summary, rows: plan.map(describe) });

  if (summary.possibleDuplicates > 0) {
    return NextResponse.json(
      { error: `Choose what to do with ${summary.possibleDuplicates} possible duplicate${summary.possibleDuplicates === 1 ? "" : "s"} first.`, summary, rows: plan.map(describe) },
      { status: 409 }
    );
  }

  const results = await runImport(prisma as unknown as ImportDb, workspaceId, plan, fileName);
  return NextResponse.json({
    summary,
    results,
    skipped: plan.filter((p) => p.action === "skip_duplicate" || p.action === "skip_name_only" || p.action === "invalid").map(describe),
  });
});
