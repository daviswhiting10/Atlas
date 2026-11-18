import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadClientProgress } from "@/lib/coach/progress";
import { getClient } from "@/lib/db/clients";
import { ProgressView } from "@/components/athlete/ProgressView";
import { ClientDetail } from "./ClientDetail";


export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  // The client's details load with the charts, on the server: the page no longer waits for a second fetch from the browser.
  const [progress, details] = await Promise.all([loadClientProgress(params.id, workspaceId), getClient(params.id, workspaceId)]);
  if (!progress || !details) notFound();
  const { data, metric } = progress;

  return (
    <ClientDetail
      // The same JSON /api/clients/[id] sends (dates as strings).
      initial={JSON.parse(JSON.stringify(details))}
      progress={<ProgressView data={data} goalMetric={metric} />}
    />
  );
}
