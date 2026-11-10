"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ChartLine, House, UserRound } from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/today", label: "Today", icon: House },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: ChartLine },
  { href: "/you", label: "You", icon: UserRound },
];

export function AppNav({ name, isDemo }: { name: string; isDemo: boolean }) {
  const pathname = usePathname();
  const inWorkout = pathname.startsWith("/workouts/");
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <header className={cn("sticky top-0 z-30 border-b border-line bg-bone/80 backdrop-blur-xl", inWorkout && "hidden md:block")}>
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-8 md:h-16">
          <Link href="/today" aria-label="Atlas home">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-line bg-white/80 p-1 md:flex" aria-label="Main">
            {TABS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={cn(
                  "press rounded-full px-4 py-1.5 text-sm font-medium",
                  isActive(href) ? "bg-ink text-white" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isDemo && <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-semibold text-gold">Demo data</span>}
            <Link href="/you" className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white" aria-label="Your profile">
              {name.charAt(0).toUpperCase()}
            </Link>
          </div>
        </div>
      </header>

      {!inWorkout && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/90 backdrop-blur-xl md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="mx-auto flex max-w-md">
            {TABS.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("press flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium", active ? "text-blue" : "text-ink-mute")}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.8} />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
