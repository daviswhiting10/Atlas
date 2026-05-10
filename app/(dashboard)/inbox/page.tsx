import { getClients, runRetentionHeuristic } from "@/lib/db/clients";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { AlertTriangle, MessageSquare, Users, TrendingUp, Zap } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default async function InboxPage() {
  const session = await auth();
  if (!session?.user?.workspaceId) redirect("/");
  await runRetentionHeuristic(session.user.workspaceId);
  const clients = await getClients(session.user.workspaceId);

  const activeClients = clients.filter((c) => c.status === "ACTIVE");
  const atRiskClients = clients.filter((c) => c.status === "AT_RISK");
  const prospects = clients.filter((c) => c.status === "PROSPECT");

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium text-primary">Atlas</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Good morning, Davis.</h1>
        <p className="text-muted-foreground mt-1">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-5">
            <div className="text-2xl font-bold">{clients.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Total Clients</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-2xl font-bold text-emerald-600">{activeClients.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-2xl font-bold text-amber-600">{atRiskClients.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">At Risk</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-2xl font-bold text-blue-600">{prospects.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Prospects</div>
          </CardContent>
        </Card>
      </div>

      {/* At-risk alerts */}
      {atRiskClients.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-800">
              <AlertTriangle className="w-4 h-4" />
              Retention Alerts — {atRiskClients.length} client{atRiskClients.length > 1 ? "s" : ""} need attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {atRiskClients.map((client) => (
              <div key={client.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-md border border-amber-100">
                <div>
                  <Link href={`/clients/${client.id}`} className="text-sm font-medium hover:text-primary">
                    {client.fullName}
                  </Link>
                  {client.retentionFlag && (
                    <p className="text-xs text-muted-foreground mt-0.5">{client.retentionFlag}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {client.retentionScore != null && (
                    <span className="text-xs font-mono text-amber-700">Score: {client.retentionScore}</span>
                  )}
                  <Link href={`/outreach?clientId=${client.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                    <MessageSquare className="w-3 h-3 mr-1" />
                    Reach out
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { href: "/clients", icon: Users, title: "Add Client", desc: "New intake or import" },
          { href: "/sessions", icon: TrendingUp, title: "Log Session", desc: "Post-session notes" },
          { href: "/outreach", icon: MessageSquare, title: "Outreach", desc: "Generate messages" },
        ].map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href}>
            <Card className="hover:border-primary/50 transition-colors h-full">
              <CardContent className="pt-5 flex flex-col gap-2">
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Client list */}
      {clients.length > 0 ? (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">All Clients</CardTitle>
            <Link href="/clients" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {clients.slice(0, 8).map((client) => (
                <Link key={client.id} href={`/clients/${client.id}`}
                  className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                      {client.fullName.charAt(0)}
                    </div>
                    <div>
                      <span className="text-sm font-medium">{client.fullName}</span>
                      {client.primaryGoal && (
                        <span className="text-xs text-muted-foreground ml-2">{client.primaryGoal.replace("_", " ")}</span>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={client.status as "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED"} />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-1">No clients yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              Add your first client to get started. Atlas will help you track, program, and retain them.
            </p>
            <Link href="/clients" className={buttonVariants()}>
              Add first client
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
