import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TZ_COOKIE } from "@/lib/athlete/data";
import { safeTimeZone } from "@/lib/athlete/sessions";
import { loadReport } from "@/lib/report/load";
import { ProgressReport } from "@/components/report/ProgressReport";

export const metadata: Metadata = { title: "Progress report" };

/** /report/<plan>/<block>: an athlete opens their own, a coach a client's in their workspace. */
export default async function ReportPage({ params }: { params: { assignmentId: string; block: string } }) {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  const report = await loadReport({
    assignmentId: params.assignmentId,
    block: Number(params.block),
    viewer: { role: user.role, workspaceId: user.workspaceId, clientProfileId: user.clientProfileId, id: user.id },
    timeZone: safeTimeZone(cookies().get(TZ_COOKIE)?.value),
  });
  if (!report) notFound();
  return <ProgressReport report={report} />;
}
