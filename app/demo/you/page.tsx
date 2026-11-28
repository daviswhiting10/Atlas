import { YouScreen } from "@/components/athlete/YouScreen";
import { DEMO_ATHLETE } from "@/lib/demo/sample";

export const metadata = { title: "You" };

/** You for the sample athlete: a coached client (no goals or account panels: the demo has no account). */
export default function DemoYou() {
  return <YouScreen athlete={DEMO_ATHLETE} base="/demo" />;
}
