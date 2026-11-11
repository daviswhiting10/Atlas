import { CoachNav } from "@/components/coach/CoachNav";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * The coach side uses the athlete app's frame: the same header, the same
 * navigation pattern, the same page width and type system (.app-ui).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "CLIENT") redirect("/today");

  const name = session.user.name || session.user.email || "Coach";

  return (
    <div className="app-ui min-h-screen bg-bone">
      <CoachNav name={name} />
      <main className="coach-ui mx-auto max-w-5xl px-4 pb-28 pt-5 sm:px-8 md:pb-16 md:pt-9">{children}</main>
    </div>
  );
}
