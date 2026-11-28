import { CoachNav } from "@/components/coach/CoachNav";
import { LiveTransitionGate } from "@/components/coach/LiveTransitionGate";
import { LiveSessionBar } from "@/components/coach/LiveSessionBar";
import { auth } from "@/lib/auth";
import { GUEST_EMAIL_DOMAIN } from "@/lib/auth/route-policy";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SaveTimeZoneIfEmpty } from "@/components/time-zone/SaveTimeZoneIfEmpty";

/**
 * The coach side uses the athlete app's frame: the same header, the same
 * navigation pattern, the same page width and type system (.app-ui).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "CLIENT") redirect("/today");

  return (
    <div className="app-ui min-h-screen bg-bone">
      <CoachNav demo={session.user.email?.endsWith(`@${GUEST_EMAIL_DOMAIN}`) === true} />
      <main className="coach-ui mx-auto max-w-5xl px-4 pb-28 pt-5 sm:px-8 md:pb-16 md:pt-9">
        {children}
        <LiveSessionBar owner={session.user.id ?? ""} />
        <LiveTransitionGate />
        <Suspense fallback={null}><SaveTimeZoneIfEmpty userId={session.user.id} /></Suspense>
      </main>
    </div>
  );
}
