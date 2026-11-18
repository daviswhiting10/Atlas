import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadClientProgress } from "@/lib/coach/progress";
import { getClient } from "@/lib/db/clients";
import { ProgressView } from "@/components/athlete/ProgressView";
import { HistoryCalendar } from "@/components/athlete/HistoryCalendar";
import { cookies } from "next/headers";
import { safeTimeZone } from "@/lib/athlete/sessions";
import { TZ_COOKIE } from "@/lib/athlete/data";
import { loadCalendar } from "@/lib/history/load";
import { ClientDetail } from "./ClientDetail";


export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  // The client's details load with the charts, on the server: the page no longer waits for a second fetch from the browser.
  // The calendar's read is scoped to this workspace too, and isn't shown unless the client is found.
  const timeZone = safeTimeZone(cookies().get(TZ_COOKIE)?.value);
  const [progress, details, calendar] = await Promise.all([
    loadClientProgress(params.id, workspaceId),
    getClient(params.id, workspaceId),
    loadCalendar({ clientId: params.id, workspaceId, timeZone, viewer: { kind: "coach", clientId: params.id } }),
  ]);
  if (!progress || !details) notFound();
  const { data, metric } = progress;

  return (
    <ClientDetail
      // The same JSON /api/clients/[id] sends (dates as strings).
      initial={JSON.parse(JSON.stringify(details))}
      progress={<ProgressView data={data} goalMetric={metric} />}
      // Under three sessions the list below already shows them all: no "Day one" on top of it.
      history={calendar.kind === "grid" ? <HistoryCalendar calendar={calendar} /> : null}
    />
  );
}
