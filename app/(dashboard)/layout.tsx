import { AppSidebar } from "@/components/app-sidebar";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  console.log("[layout] session:", JSON.stringify({ id: session?.user?.id, workspaceId: session?.user?.workspaceId }));
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-56 min-h-screen">
        {children}
      </main>
    </div>
  );
}
