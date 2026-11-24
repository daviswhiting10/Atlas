"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { athleteIdentity } from "@/lib/athlete/identity";
import { prisma } from "@/lib/db/client";
import { MAX_LB, MIN_LB, lbToKg } from "@/lib/athlete/body-weight";

/** Entries a day before it looks like a mistake (a held key, a double tap) rather than weighing in. */
const PER_DAY = 10;

/** "Add body weight" from the Me ⋯ menu: one entry, today, for the signed-in athlete (a client or a coach's own training). */
export async function addBodyWeight(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const input = z.object({ lb: z.number().finite() }).safeParse(raw);
  if (!input.success) return { ok: false, error: "Enter your weight in pounds." };
  const lb = Math.round(input.data.lb * 10) / 10;
  if (lb < MIN_LB || lb > MAX_LB) return { ok: false, error: `Enter a weight between ${MIN_LB} and ${MAX_LB} lb.` };
  const session = await auth();
  const me = await athleteIdentity(session?.user);
  if (!me || !session?.user?.id) return { ok: false, error: "Sign in to add your weight." };
  try {
    const today = await prisma.measurement.count({
      where: { clientId: me.clientId, workspaceId: me.workspaceId, bodyWeightKg: { not: null }, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    if (today >= PER_DAY) return { ok: false, error: "That's a lot of weigh-ins today. Try again tomorrow." };
    await prisma.measurement.create({
      data: { workspaceId: me.workspaceId, clientId: me.clientId, measuredAt: new Date(), bodyWeightKg: lbToKg(lb), source: "manual", enteredByUserId: session.user.id },
    });
  } catch (err) {
    console.error("[body weight]", err);
    return { ok: false, error: "Couldn't save that. Please try again." };
  }
  revalidatePath("/progress");
  return { ok: true };
}
