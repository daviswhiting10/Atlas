import { AppNav } from "@/components/athlete/AppNav";
import { getAthlete } from "@/lib/athlete/data";

export default async function AthleteLayout({ children }: { children: React.ReactNode }) {
  const athlete = await getAthlete();
  return (
    <div className="app-ui min-h-screen bg-bone">
      <AppNav isDemo={athlete.isDemo} isCoach={athlete.isCoach} hasProgress={athlete.hasHistory} />
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 sm:px-8 md:pb-16 md:pt-9">{children}</main>
    </div>
  );
}
