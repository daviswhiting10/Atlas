import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoLogger } from "@/components/demo/DemoLogger";
import { demoLoggerData } from "@/lib/demo/sample";

export const metadata = { title: "Workout" };

/** The logger on a sample workout (today's Upper A is half done). Saves stay in this tab; Reset clears them. */
export default function DemoWorkout({ params }: { params: { id: string } }) {
  // "Log another workout" on Today: not part of the demo, said plainly, one tap back.
  if (params.id === "new") {
    return (
      <div className="surface rise p-8">
        <h1 className="text-3xl text-ink">Not in the demo</h1>
        <p className="mt-2 max-w-sm text-[15px] text-ink-soft">Logging a workout outside the plan needs an account. Try today&apos;s Upper A instead.</p>
        <Link href="/demo" className="press mt-6 inline-flex h-12 items-center rounded-xl bg-dusk-button px-6 text-[15px] font-semibold text-dusk-button-text">
          Back to Today
        </Link>
      </div>
    );
  }
  const data = demoLoggerData(params.id);
  if (!data) notFound();
  return <DemoLogger data={data} />;
}
