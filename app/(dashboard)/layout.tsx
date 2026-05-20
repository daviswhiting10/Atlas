import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      {/* pb-24 on mobile reserves space above the bottom tab bar + safe area */}
      <main className="md:ml-56 min-h-screen pb-24 md:pb-0">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
