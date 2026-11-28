"use server";

/**
 * The signed-in person's timezone, from their browser, saved once: the zone MCP reads and writes fall back to when the
 * AI passes none (lib/mcp/data.ts, zoneFor). Only a known IANA name is saved; nothing else comes from the client.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ianaZone } from "@/lib/athlete/sessions";

/** First load: save the browser's zone if none is saved yet. Never overwrites (a token creation does, lib/actions/mcp-tokens.ts). */
export async function saveTimeZoneIfEmpty(raw: unknown): Promise<{ ok: boolean }> {
  const userId = (await auth())?.user?.id;
  const zone = ianaZone(raw);
  if (!userId || !zone) return { ok: false };
  await prisma.user.updateMany({ where: { id: userId, timeZone: null }, data: { timeZone: zone } });
  return { ok: true };
}
