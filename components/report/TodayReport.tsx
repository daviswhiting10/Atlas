import { cookies } from "next/headers";
import { TZ_COOKIE } from "@/lib/athlete/data";
import { localDay, safeTimeZone } from "@/lib/athlete/sessions";
import { CARD_DAYS, daysBetween } from "@/lib/report/blocks";
import { listReports } from "@/lib/report/load";
import { ReportLink } from "./ReportLink";

/** On Today for CARD_DAYS days after a block ends; nothing before or after (Plan keeps the old ones). */
export async function TodayReport({ clientId, workspaceId }: { clientId: string; workspaceId: string }) {
  const timeZone = safeTimeZone(cookies().get(TZ_COOKIE)?.value);
  const [latest] = await listReports(clientId, workspaceId, timeZone);
  if (!latest) return null;
  const since = daysBetween(latest.end, localDay(new Date(), timeZone));
  if (since < 1 || since > CARD_DAYS) return null;
  return <ReportLink entry={latest} className="sm:max-w-sm" />;
}
