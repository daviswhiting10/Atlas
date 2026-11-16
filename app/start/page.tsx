import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/athlete/Logo";
import { PlanWizard } from "@/components/athlete/PlanWizard";
import { DEFAULT_PREFS } from "@/lib/plan/generator";

export const metadata: Metadata = { title: "Build your plan" };

export default function StartPage() {
  return (
    <div className="min-h-screen bg-bone">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:h-20 sm:px-8">
        <Link href="/" aria-label="Atlas home" className="flex min-h-11 items-center">
          <Logo />
        </Link>
        <Link href="/login" className="press inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-ink-soft hover:text-ink">
          Sign in
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-4 sm:px-8 sm:pt-8">
        <PlanWizard mode="signup" initial={DEFAULT_PREFS} />
      </main>
    </div>
  );
}
