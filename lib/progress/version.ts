/**
 * A fingerprint of the rows Progress is computed from, for one client: every session (its day, whether it is finished,
 * which plan workout it was) and every set (its lift, weight, reps, done). Any write to them (a set ticked or edited, a
 * session finished, moved, imported or deleted, from the app, MCP, an import or a script) changes it, so a cached
 * Progress keyed on it can't be stale for those rows, and no write path has to remember to clear anything.
 *
 * The database does the hashing: one short row comes back instead of every set the athlete has logged.
 * NULLs are written as "-" so (weight null, reps 5) and (weight 5, reps null) differ.
 */
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";

export const PROGRESS_VERSION_SQL = (clientId: string) => Prisma.sql`
  select md5(coalesce(string_agg(x, ',' order by x), '')) as v from (
    select concat('w:', l.id, ':', l.date, ':', coalesce(l."completedAt"::text, '-'), ':', coalesce(l."assignedWorkoutId", '-')) as x
      from "WorkoutLog" l where l."clientId" = ${clientId}
    union all
    select concat('s:', s.id, ':', s."workoutLogId", ':', coalesce(s."exerciseId", '-'), ':', coalesce(s.weight::text, '-'), ':', coalesce(s.reps::text, '-'), ':', s.completed)
      from "SetLog" s join "WorkoutLog" l on l.id = s."workoutLogId" where l."clientId" = ${clientId}
  ) t`;

export async function progressVersion(clientId: string): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ v: string }>>(PROGRESS_VERSION_SQL(clientId));
  return rows[0]?.v ?? "";
}
