"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, ChartLine, House, UserRound } from "lucide-react";
import { HeaderActions } from "@/components/nav/HeaderActions";
import { useTabSwitch } from "@/components/nav/useTabSwitch";
import { useRegisterChrome } from "@/components/mode/context";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/today", label: "Today", icon: House },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: ChartLine },
  { href: "/you", label: "You", icon: UserRound },
];

/** `isCoach`: a coach on their own training gets the Coach | Me toggle (the way back to their clients).
 *  There's no avatar: the person is the You tab. */
export function AppNav({ isDemo, isCoach = false, hasProgress = true, preview }: { isDemo: boolean; isCoach?: boolean; /** No Progress tab until there is a finished session to show. */ hasProgress?: boolean; /** Drawn as the optimistic shell while this side loads: as if on this path, and doing nothing else. */ preview?: string }) {
  const real = usePathname();
  const pathname = preview ?? real;
  useRegisterChrome(preview ? {} : { demo: isDemo, hasProgress });
  const router = useRouter();

  // Tell the server which timezone to bucket logged sessions in. On a first
  // visit the cookie is missing, so set it and re-render once with real dates.
  useEffect(() => {
    if (preview) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || document.cookie.split("; ").includes(`tz=${tz}`)) return;
    document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router, preview]);

  const tabs = hasProgress ? TABS : TABS.filter((t) => t.href !== "/progress");
  const inWorkout = pathname.startsWith("/workouts/");
  const isActive = useCallback((href: string) => pathname === href || pathname.startsWith(href + "/"), [pathname]);
  const { onClick, chosen } = useTabSwitch(pathname, isActive);

  return (
    <>
      <header className={cn("sticky top-0 z-30 border-b border-line bg-bone/80 backdrop-blur-xl", inWorkout && "hidden md:block")}>
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-8 md:h-16">

          <nav className="hidden items-center gap-1 rounded-full border border-line bg-paper/80 p-1 md:flex" aria-label="Main">
            {tabs.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                prefetch
                onClick={(e) => onClick(e, href)}
                aria-current={chosen(href) ? "page" : undefined}
                className={cn(
                  "press rounded-full px-4 py-1.5 text-sm font-medium",
                  chosen(href) ? "bg-ink text-bone" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <HeaderActions side="me" demo={isDemo} isCoach={isCoach} />
        </div>
      </header>

      {!inWorkout && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/90 backdrop-blur-xl md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="mx-auto flex max-w-md">
            {tabs.map(({ href, label, icon: Icon }) => {
              const active = chosen(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={(e) => onClick(e, href)}
                  // Each tab's whole screen is fetched ahead, so the first tap to it is as instant as the second.
                  prefetch
                  aria-current={active ? "page" : undefined}
                  className={cn("press flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium", active ? "text-signal" : "text-ink-mute")}
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
