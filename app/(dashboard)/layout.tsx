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
      {/* pb-nav-safe reserves space above the fixed bottom tab bar + home indicator */}
      <main className="md:ml-56 min-h-screen pb-nav-safe">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
