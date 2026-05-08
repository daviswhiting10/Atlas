import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { getTrainer, updateTrainer } from "@/lib/db/trainer";

const UpdateSchema = z.object({
  bio: z.string().optional(),
  certifications: z.array(z.string()).optional(),
  voiceProfile: z.unknown().optional(),
});

export const GET = withWorkspace(async (_req, { workspaceId }) => {
  const trainer = await getTrainer(workspaceId);
  return NextResponse.json(trainer ?? null);
});

export const PATCH = withWorkspace(async (req, { userId }) => {
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const trainer = await updateTrainer(userId, {
    bio: parsed.data.bio,
    certifications: parsed.data.certifications,
    voiceProfile: parsed.data.voiceProfile as Record<string, unknown> | undefined,
  });
  return NextResponse.json(trainer);
});
