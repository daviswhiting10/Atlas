import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@/app/generated/prisma/client";
import { updateTrainer } from "@/lib/db/trainer";

const VOICE_MAX = 8000;

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  voiceProfile: z.string().max(VOICE_MAX).optional(),
});

/** The signed-in coach's own profile: name, sign-in email, and the voice the AI writes in. */
async function profile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, trainerProfile: { select: { voiceProfile: true } } },
  });
  const voice = user?.trainerProfile?.voiceProfile;
  return {
    name: user?.name ?? "",
    email: user?.email ?? "",
    voiceProfile: typeof voice === "string" ? voice : voice ? JSON.stringify(voice) : "",
  };
}

export const GET = withWorkspace(async (_req, { userId }) => NextResponse.json(await profile(userId)));

export const PATCH = withWorkspace(async (req, { userId }) => {
  const parsed = UpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, voiceProfile } = parsed.data;
  if (name !== undefined) await prisma.user.update({ where: { id: userId }, data: { name } });
  if (voiceProfile !== undefined) await updateTrainer(userId, { voiceProfile: voiceProfile.trim() || Prisma.DbNull });
  return NextResponse.json(await profile(userId));
});
