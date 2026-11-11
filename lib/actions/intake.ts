"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ROSTER } from "@/lib/db/roster";
import { assignProgram } from "@/lib/db/programs";
import { createClient } from "@/lib/db/clients";
import { CATEGORIES } from "@/lib/programs/categories";
import { INTAKE_NOTE_SOURCE } from "@/lib/clients/intake-source";


const Input = z.object({
  clientId: z.string().min(1).max(64).optional(),
  newClientName: z.string().trim().min(1).max(120).optional(),
  tag: z.enum(CATEGORIES.map((c) => c.tag) as [string, ...string[]]),
  notes: z.string().trim().max(8000),
  programId: z.string().min(1).max(64).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type IntakeResult = { ok: true; clientId: string } | { ok: false; error: string };

/**
 * Save an intake: the goal tag (which sets the client's goal), a paragraph
 * of notes, and optionally a program from the library given to the client
 * as their live plan. Everything is scoped to the signed-in coach.
 */
export async function saveIntake(raw: z.input<typeof Input>): Promise<IntakeResult> {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!session?.user?.id || !workspaceId || session.user.role === "CLIENT") return { ok: false, error: "Sign in as a coach first." };

  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Choose a client and a goal." };
  const { clientId, newClientName, tag, notes, programId, startDate } = parsed.data;
  if (!clientId && !newClientName) return { ok: false, error: "Choose a client, or type a new client's name." };

  const goalCode = CATEGORIES.find((c) => c.tag === tag)!.goalCode;

  try {
    let id: string;
    if (clientId) {
      const client = await prisma.clientProfile.findFirst({ where: { id: clientId, workspaceId, deletedAt: null, ...ROSTER }, select: { id: true } });
      if (!client) return { ok: false, error: "That client isn't on your roster." };
      id = client.id;
      await prisma.clientProfile.update({ where: { id }, data: { primaryGoal: goalCode } });
    } else {
      const created = await createClient(workspaceId, { fullName: newClientName!, primaryGoal: goalCode, status: "ACTIVE" });
      id = created.id;
    }

    await prisma.intakeForm.create({
      data: { clientId: id, sourceType: INTAKE_NOTE_SOURCE, parsedData: { tag, notes } },
    });

    if (programId) {
      const program = await prisma.program.findFirst({ where: { id: programId, workspaceId, deletedAt: null }, select: { id: true } });
      if (!program) return { ok: false, error: "That program isn't in your library." };
      const start = startDate ? new Date(`${startDate}T00:00:00`) : new Date(new Date().setHours(0, 0, 0, 0));
      const assignment = await assignProgram(workspaceId, program.id, id, start);
      // The new program is the client's plan now; any earlier one is finished (its history stays).
      await prisma.programAssignment.updateMany({
        where: { clientId: id, workspaceId, status: "ACTIVE", NOT: { id: assignment.id } },
        data: { status: "COMPLETED" },
      });
    }

    revalidatePath(`/clients/${id}`);
    revalidatePath("/clients");
    revalidatePath("/log");
    return { ok: true, clientId: id };
  } catch (err) {
    console.error("[intake]", err);
    return { ok: false, error: "Couldn't save the intake. Please try again." };
  }
}
