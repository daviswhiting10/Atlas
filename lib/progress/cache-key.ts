/**
 * What a cached Progress is keyed on (lib/athlete/data getProgress): next/cache keys an entry on its arguments, so
 * these are the arguments, in order. Whose it is comes first (client and workspace), so one athlete's Progress is never
 * another's; then everything else the result depends on. Pure: no I/O.
 */
import { localDay } from "@/lib/athlete/sessions";

export type ProgressKey = [clientId: string, workspaceId: string, selfServe: boolean, timeZone: string, today: string, version: string];

export function progressKey(
  athlete: { clientId: string; workspaceId: string; selfServe: boolean },
  { timeZone, now, version }: { timeZone: string; now: Date; version: string }
): ProgressKey {
  // Today: streaks and stalls are counted to it, so a new day is a new entry.
  return [athlete.clientId, athlete.workspaceId, athlete.selfServe, timeZone, localDay(now, timeZone), version];
}
