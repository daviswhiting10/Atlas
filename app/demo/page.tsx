import { TodayScreen } from "@/components/athlete/TodayScreen";
import { HomeProgressView } from "@/components/athlete/HomeProgress";
import { DEMO_ATHLETE, DEMO_CALENDAR, DEMO_PLAN, DEMO_PROGRESS } from "@/lib/demo/sample";
import { demoSessionSummary } from "@/lib/demo/summary";

export const metadata = { title: "Today" };

/** Home for the sample athlete: Alex's strength curve and heatmap, then week 20, Upper A, and Coach Jess's week note. */
export default function DemoToday() {
  return (
    <TodayScreen
      athlete={DEMO_ATHLETE}
      plan={DEMO_PLAN}
      goal={null}
      base="/demo"
      progress={<HomeProgressView athlete={DEMO_ATHLETE} data={DEMO_PROGRESS} calendar={DEMO_CALENDAR} summary={demoSessionSummary} base="/demo" />}
    />
  );
}
