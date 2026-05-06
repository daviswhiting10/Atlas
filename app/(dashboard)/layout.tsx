import { AppSidebar } from "@/components/app-sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-56 min-h-screen">
        {children}
      </main>
    </div>
  );
}
