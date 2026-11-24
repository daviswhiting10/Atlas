import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TZ_COOKIE } from "@/lib/athlete/data";
import { safeTimeZone } from "@/lib/athlete/sessions";
import { loadDashboard } from "@/lib/coach/dashboard-data";
import { DashboardView } from "./DashboardView";

export const metadata: Metadata = { title: "Dashboard" };

/** The coach's landing: every active client at a glance. (The Roster has them all in detail.) */
export default async function DashboardPage() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");
  const { rows } = await loadDashboard(workspaceId, safeTimeZone(cookies().get(TZ_COOKIE)?.value));
  return <DashboardView rows={rows} />;
}
