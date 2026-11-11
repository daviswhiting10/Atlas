"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Dumbbell, Inbox, LogOut, MoreHorizontal, Settings, Users, X } from "lucide-react";
import { Logo } from "@/components/athlete/Logo";
import { cn } from "@/lib/utils";

/** Same order as the old sidebar groups: Today, Clients, Training, Outreach, Business. */
const ITEMS = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/clients", label: "Roster", icon: Users },
  { href: "/intake", label: "Intake" },
  { href: "/programs", label: "Programs", icon: Dumbbell },
  { href: "/sessions", label: "Sessions", icon: ClipboardList },
  { href: "/outreach", label: "Outreach" },
  { href: "/pricing", label: "Pricing" },
] as const;

/** Phones get the four most-used sections as tabs; the rest sit behind "More". */
const TABS = ITEMS.filter((i) => "icon" in i) as unknown as Array<{ href: string; label: string; icon: typeof Inbox }>;
const MORE: Array<{ href: string; label: string }> = [...ITEMS.filter((i) => !("icon" in i)), { href: "/settings", label: "Settings" }];

export function CoachNav({ name }: { name: string }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  useEffect(() => setMore(false), [pathname]);

  async function signOut() {
    const { signOut } = await import("next-auth/react");
    await signOut({ callbackUrl: `${window.location.origin}/login` });
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bone/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-8 md:h-16">
          <Link href="/inbox" aria-label="Atlas home" className="shrink-0">
            <Logo />
          </Link>

          <nav className="no-scrollbar hidden min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-line bg-white/80 p-1 md:flex" aria-label="Main">
            {ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={cn(
                  "press whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium",
                  isActive(href) ? "bg-ink text-white" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/settings"
              aria-label="Settings"
              className={cn("press hidden h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink md:flex", isActive("/settings") && "bg-ink/5 text-ink")}
            >
              <Settings className="h-[18px] w-[18px]" />
            </Link>
            <button type="button" onClick={signOut} aria-label="Sign out" className="press hidden h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink md:flex">
              <LogOut className="h-[18px] w-[18px]" />
            </button>
            <span className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white" title={name}>
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/90 backdrop-blur-xl md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
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
          <button
            type="button"
            onClick={() => setMore(true)}
            className={cn("press flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium", MORE.some((m) => isActive(m.href)) ? "text-signal" : "text-ink-mute")}
          >
            <MoreHorizontal className="h-[22px] w-[22px]" />
            More
          </button>
        </div>
      </nav>

      {more && (
        <div className="fade-in fixed inset-0 z-50 flex items-end bg-night/40 backdrop-blur-sm md:hidden" onClick={() => setMore(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
            className="sheet-up w-full rounded-t-2xl bg-bone p-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
          >
            <div className="flex items-center justify-between">
              <p className="eyebrow">More</p>
              <button type="button" onClick={() => setMore(false)} aria-label="Close" className="press flex h-9 w-9 items-center justify-center rounded-full bg-ink/5 text-ink-soft">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="mt-2 divide-y divide-line">
              {MORE.map((m) => (
                <li key={m.href}>
                  <Link href={m.href} className={cn("press block py-3.5 text-[15px] font-medium", isActive(m.href) ? "text-signal" : "text-ink")}>
                    {m.label}
                  </Link>
                </li>
              ))}
              <li>
                <button type="button" onClick={signOut} className="press block w-full py-3.5 text-left text-[15px] font-medium text-ink-soft">
                  Sign out
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
