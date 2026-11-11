"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, ChartLine, House, UserRound, Users } from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/today", label: "Today", icon: House },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: ChartLine },
  { href: "/you", label: "You", icon: UserRound },
];

/** `isCoach`: a coach in My training gets a way back to their clients. */
export function AppNav({ name, isDemo, isCoach = false }: { name: string; isDemo: boolean; isCoach?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  // Tell the server which timezone to bucket logged sessions in. On a first
  // visit the cookie is missing, so set it and re-render once with real dates.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || document.cookie.split("; ").includes(`tz=${tz}`)) return;
    document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);

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
            {isDemo && <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11px] font-medium text-ink-mute">Demo data</span>}
            {isCoach && (
              <Link href="/log" className="press hidden h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-sm font-medium text-ink-soft hover:border-ink/20 hover:text-ink md:flex">
                <ArrowLeft className="h-4 w-4" /> Coaching
              </Link>
            )}
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
                  className={cn("press flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium", active ? "text-signal" : "text-ink-mute")}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.8} />
                  {label}
                </Link>
              );
            })}
            {isCoach && (
              <Link href="/log" className="press flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium text-ink-mute">
                <Users className="h-[22px] w-[22px]" strokeWidth={1.8} />
                Coaching
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
