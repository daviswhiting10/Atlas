/**
 * Writes an import plan for one workspace. The workspace is always the
 * signed-in coach's (passed in by the route); nothing in the plan can
 * point a write anywhere else: creates are stamped with it, and merges only
 * touch a client found inside it.
 */

import type { Prisma } from "@/app/generated/prisma/client";
import { createClient } from "@/lib/db/clients";
import type { ClientRow, PlannedRow } from "./import";

/** The slice of Prisma the import uses, so tests can pass a fake. */
export type ImportDb = {
  $transaction<T>(fn: (tx: ImportTx) => Promise<T>): Promise<T>;
};
export type ImportTx = {
  clientProfile: {
    create(args: { data: Prisma.ClientProfileUncheckedCreateInput }): Promise<{ id: string }>;
    findFirst(args: {
      where: { id: string; workspaceId: string; deletedAt: null };
      select: { id: true; email: true; phone: true; primaryGoal: true; lastContactAt: true };
    }): Promise<{ id: string; email: string | null; phone: string | null; primaryGoal: string | null; lastContactAt: Date | null } | null>;
    update(args: { where: { id: string }; data: Prisma.ClientProfileUncheckedUpdateInput }): Promise<unknown>;
  };
  intakeForm: { create(args: { data: Prisma.IntakeFormUncheckedCreateInput }): Promise<unknown> };
};

/** Imported spreadsheet details are stored as an intake form with this source, and shown as "Imported details". */
export const CSV_SOURCE = "csv-import";

export type RowResult = { row: number; name: string; outcome: "created" | "updated" | "failed"; clientId?: string; error?: string };

function detailsRecord(client: ClientRow, fileName: string, now: Date) {
  return {
    source: CSV_SOURCE,
    fileName,
    row: client.row,
    importedAt: now.toISOString(),
    fields: client.details,
  };
}

export async function runImport(db: ImportDb, workspaceId: string, plan: PlannedRow[], fileName: string, now = new Date()): Promise<RowResult[]> {
  const results: RowResult[] = [];
  for (const p of plan) {
    if (p.action !== "create" && p.action !== "merge") continue;
    const c = p.client;
    try {
      const clientId = await db.$transaction(async (tx) => {
        let id: string;
        if (p.action === "create") {
          const created = await createClient(
            workspaceId,
            {
              fullName: c.fullName,
              email: c.email ?? undefined,
              phone: c.phone ?? undefined,
              primaryGoal: c.primaryGoal ?? undefined,
              status: c.status,
              lastContactAt: c.lastContactAt ?? undefined,
            },
            tx as never
          );
          id = created.id;
        } else {
          // Fill in only what the existing client is missing; never overwrite.
          const current = await tx.clientProfile.findFirst({
            where: { id: p.existing.id, workspaceId, deletedAt: null },
            select: { id: true, email: true, phone: true, primaryGoal: true, lastContactAt: true },
          });
          if (!current) throw new Error("that client is no longer on your roster");
          const data: Prisma.ClientProfileUncheckedUpdateInput = {};
          if (!current.email && c.email) data.email = c.email;
          if (!current.phone && c.phone) data.phone = c.phone;
          if (!current.primaryGoal && c.primaryGoal) data.primaryGoal = c.primaryGoal;
          if (c.lastContactAt && (!current.lastContactAt || c.lastContactAt > current.lastContactAt)) data.lastContactAt = c.lastContactAt;
          if (Object.keys(data).length > 0) await tx.clientProfile.update({ where: { id: current.id }, data });
          id = current.id;
        }
        if (Object.keys(c.details).length > 0) {
          await tx.intakeForm.create({ data: { clientId: id, sourceType: CSV_SOURCE, parsedData: detailsRecord(c, fileName, now) } });
        }
        return id;
      });
      results.push({ row: c.row, name: c.fullName, outcome: p.action === "create" ? "created" : "updated", clientId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "couldn't be saved";
      results.push({ row: c.row, name: c.fullName, outcome: "failed", error: message.length > 200 ? "couldn't be saved" : message });
    }
  }
  return results;
}
