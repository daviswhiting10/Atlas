"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, ChartLine, House, UserRound } from "lucide-react";
import { toast } from "sonner";
import { demoStore } from "@/lib/demo/store";
import { exitTo } from "@/lib/demo/exit";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/demo", label: "Today", icon: House },
  { href: "/demo/plan", label: "Plan", icon: CalendarDays },
  { href: "/demo/progress", label: "Progress", icon: ChartLine },
  { href: "/demo/you", label: "You", icon: UserRound },
];
const FROM_KEY = "atlas-demo-from";

/**
 * The demo's own frame: the athlete header, the demo bar (DEMO · SAMPLE ATHLETE, Reset, Exit: one tap each, no
 * confirm) and the bottom bar, every link inside /demo. A signed-in session in the same browser is never touched.
 */
export function DemoShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Remember where the demo was opened from (this tab only), so Exit can go back there. Read from the address
  // after the page arrives, so the frame itself is in the first HTML (no waiting on search params).
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    if (!from) return;
    try {
      sessionStorage.setItem(FROM_KEY, from);
    } catch {}
  }, []);

  const reset = () => {
    demoStore.reset();
    router.refresh();
    toast.success("Demo reset");
  };
  const exit = () => {
    let from: string | null = new URLSearchParams(window.location.search).get("from");
    try {
      from = from ?? sessionStorage.getItem(FROM_KEY);
      sessionStorage.removeItem(FROM_KEY);
    } catch {}
    demoStore.reset();
    router.push(exitTo(from));
  };
  const active = (href: string) => (href === "/demo" ? pathname === "/demo" : pathname.startsWith(href));

  return (
    <div className="app-ui min-h-screen bg-bone">
      <header className="sticky top-0 z-30 border-b border-line bg-bone/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2.5 px-4 sm:px-8">
          <Link href="/demo" aria-label="Demo home" className="flex min-h-11 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-signal text-[15px] font-bold text-night">A</span>
            <span className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Atlas</span>
          </Link>
        </div>
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 pb-2 sm:px-8" role="region" aria-label="Demo">
          <span className="flex-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-mute">Demo · sample athlete</span>
          <button type="button" onClick={reset} className="press min-h-11 rounded-full border border-line px-4 text-[14px] font-semibold text-ink">
            Reset
          </button>
          <button type="button" onClick={exit} className="press min-h-11 rounded-full bg-dusk-button px-4 text-[14px] font-semibold text-dusk-button-text">
            Exit
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 sm:px-8 md:pb-16 md:pt-9">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bone/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <ul className="mx-auto flex max-w-md">
          {TABS.map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex-1">
              <Link href={href} prefetch className={cn("press flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active(href) ? "text-ink" : "text-ink-mute")}>
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
