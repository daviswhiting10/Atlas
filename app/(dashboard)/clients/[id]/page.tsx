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
import { hasProgressToShow, newestIsLighter } from "@/lib/progress/overall";
import { listReports } from "@/lib/report/load";
import { ReportLink } from "@/components/report/ReportLink";
import { prisma } from "@/lib/db/client";
import { loginStatus } from "@/lib/coach/login-status";
import { ClientDetail } from "./ClientDetail";


export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  // The client's details load with the charts, on the server: the page no longer waits for a second fetch from the browser.
  // The calendar's read is scoped to this workspace too, and isn't shown unless the client is found.
  const timeZone = safeTimeZone(cookies().get(TZ_COOKIE)?.value);
  const [progress, details, calendar, reports] = await Promise.all([
    loadClientProgress(params.id, workspaceId),
    getClient(params.id, workspaceId),
    loadCalendar({ clientId: params.id, workspaceId, timeZone, viewer: { kind: "coach", clientId: params.id } }),
    // The latest finished block with a report, as one row under "Log session".
    listReports(params.id, workspaceId, timeZone),
  ]);
  if (!progress || !details) notFound();
  // Where the client is with the app: invited, opened, password set (worked out from their login; nothing stored).
  const login = await prisma.user.findFirst({ where: { id: details.userId ?? "-", workspaceId }, select: { emailVerified: true, passwordHash: true } });
  const access = loginStatus({ hasEmail: !!details.email }, login ? { emailVerified: login.emailVerified, hasPassword: login.passwordHash != null } : null);
  const { data, metric } = progress;

  return (
    <ClientDetail
      // The same JSON /api/clients/[id] sends (dates as strings).
      initial={JSON.parse(JSON.stringify(details))}
      // Nothing to chart yet (a thin history): no Progress tab; the page opens on Sessions.
      progress={
        hasProgressToShow(data) ? (
          <>
            {/* The line leaves lighter weeks out, so it can end before her latest session: say so. */}
            {newestIsLighter(data.exercises) && <p className="mb-4 text-[13px] text-ink-mute">Lighter week: its sessions aren&apos;t in the line.</p>}
            <ProgressView data={data} goalMetric={metric} />
          </>
        ) : null
      }
      // Under three sessions the list below already shows them all: no "Day one" on top of it.
      history={calendar.kind === "grid" ? <HistoryCalendar calendar={calendar} /> : null}
      access={access}
      report={reports[0] ? <ReportLink entry={reports[0]} className="sm:max-w-sm" /> : null}
    />
  );
}
