import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";

const SaveSchema = z.object({
  clientId: z.string().optional(),
  leadId: z.string().optional(),
  channel: z.string(),
  purpose: z.string(),
  generatedDraft: z.string(),
});

export const POST = withWorkspace(async (req, { workspaceId }) => {
  const body = await req.json();
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [msg] = await Promise.all([
    prisma.outreachMessage.create({
      data: {
        workspaceId,
        clientId: parsed.data.clientId ?? null,
        leadId: parsed.data.leadId ?? null,
        channel: parsed.data.channel,
        purpose: parsed.data.purpose,
        generatedDraft: parsed.data.generatedDraft,
      },
    }),
    // Update lastContactAt so retention heuristic resets for this client
    parsed.data.clientId
      ? prisma.clientProfile.updateMany({
          where: { id: parsed.data.clientId, workspaceId },
          data: { lastContactAt: new Date() },
        })
      : Promise.resolve(),
  ]);
  return NextResponse.json(msg, { status: 201 });
});
