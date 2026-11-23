import { ProgressScreen } from "@/components/athlete/ProgressScreen";
import { DEMO_ATHLETE, DEMO_BODY_WEIGHT, DEMO_CALENDAR, DEMO_PROGRESS } from "@/lib/demo/sample";
import { demoSessionSummary } from "@/lib/demo/summary";

export const metadata = { title: "Progress" };

/** The sample athlete's progress: strength, History (26 weeks), records, body weight 188 → 180. */
export default function DemoProgress() {
  return <ProgressScreen athlete={DEMO_ATHLETE} data={DEMO_PROGRESS} calendar={DEMO_CALENDAR} chapters={[]} bodyWeight={DEMO_BODY_WEIGHT} summary={demoSessionSummary} />;
}
