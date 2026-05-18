import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "CLIENT") redirect("/inbox");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 h-14 flex items-center justify-between">
        <span className="font-semibold text-sm tracking-tight">Atlas</span>
        <span className="text-xs text-muted-foreground">{session.user.name ?? session.user.email}</span>
      </header>
      <main>{children}</main>
    </div>
  );
}
