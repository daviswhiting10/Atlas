import { prisma } from "@/lib/db/client";
import { SaveTimeZone } from "./SaveTimeZone";

/**
 * Server side of the first-load save: renders the sender only when the account has no zone yet, so a page load with
 * one saved writes nothing. Put it in a <Suspense> so the lookup never holds up the page.
 */
export async function SaveTimeZoneIfEmpty({ userId }: { userId: string | null | undefined }) {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
  return user && !user.timeZone ? <SaveTimeZone /> : null;
}
