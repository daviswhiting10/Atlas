import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/DemoShell";

/** /demo: one fixed sample athlete. No sign-in, no account, nothing stored, no cookies; never indexed. */
export const metadata: Metadata = { title: { default: "Demo", template: "%s · Atlas demo" }, robots: { index: false, follow: false } };

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoShell>{children}</DemoShell>;
}
