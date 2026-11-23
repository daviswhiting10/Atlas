import { TodayScreen } from "@/components/athlete/TodayScreen";
import { DEMO_ATHLETE, DEMO_PLAN } from "@/lib/demo/sample";

export const metadata = { title: "Today" };

/** Today for the sample athlete: week 20, Upper A, and Coach Jess's week note. */
export default function DemoToday() {
  return <TodayScreen athlete={DEMO_ATHLETE} plan={DEMO_PLAN} goal={null} base="/demo" />;
}
