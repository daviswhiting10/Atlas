import { AppNav } from "@/components/athlete/AppNav";
import { getAthlete } from "@/lib/athlete/data";

export default async function AthleteLayout({ children }: { children: React.ReactNode }) {
  const athlete = await getAthlete();
  return (
    <div className="min-h-screen bg-bone">
      <AppNav name={athlete.firstName} isDemo={athlete.isDemo} />
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 sm:px-8 md:pb-16 md:pt-9">{children}</main>
    </div>
  );
}
