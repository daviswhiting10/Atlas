"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Inbox,
  Users,
  Dumbbell,
  MoreHorizontal,
  X,
  MessageSquare,
  FileText,
  DollarSign,
  Settings,
  ClipboardList,
  LogOut,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  {
    id: "today",
    label: "Today",
    icon: Inbox,
    href: "/inbox",
    activeOn: (p: string) => p === "/inbox" || p.startsWith("/inbox/"),
  },
  {
    id: "clients",
    label: "Clients",
    icon: Users,
    href: "/clients",
    activeOn: (p: string) =>
      p === "/clients" ||
      (p.startsWith("/clients/") && !p.includes("/log")),
  },
  {
    id: "log",
    label: "Log",
    icon: ClipboardList,
    href: "/clients",
    activeOn: (p: string) => p.includes("/log"),
  },
  {
    id: "programs",
    label: "Programs",
    icon: Dumbbell,
    href: "/programs",
    activeOn: (p: string) => p.startsWith("/programs"),
  },
] as const;

const MORE_LINKS = [
  { href: "/outreach", icon: MessageSquare, label: "Outreach" },
  { href: "/intake", icon: FileText, label: "Intake" },
  { href: "/pricing", icon: DollarSign, label: "Pricing" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  function handleTabTap() {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }
  }

  const moreActive =
    MORE_LINKS.some((l) => pathname.startsWith(l.href)) ||
    pathname.startsWith("/sessions");

  return (
    <>
      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="h-16 flex items-stretch">
          {TABS.map(({ id, label, icon: Icon, href, activeOn }) => {
            const active = activeOn(pathname);
            return (
              <Link
                key={id}
                href={href}
                onClick={handleTabTap}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors min-h-[44px]",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon
                  className={cn("w-5 h-5", active ? "stroke-[2.5]" : "stroke-[1.5]")}
                />
                {label}
              </Link>
            );
          })}

          {/* More tab */}
          <button
            onClick={() => { handleTabTap(); setMoreOpen(true); }}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors min-h-[44px]",
              moreOpen || moreActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MoreHorizontal
              className={cn(
                "w-5 h-5",
                moreOpen || moreActive ? "stroke-[2.5]" : "stroke-[1.5]"
              )}
            />
            More
          </button>
        </div>
      </nav>

      {/* More bottom sheet */}
      {moreOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/40 md:hidden"
            onClick={() => setMoreOpen(false)}
          />

          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl md:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Handle + header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-foreground flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-background" strokeWidth={2.5} />
                </div>
                <span className="font-semibold text-sm">Atlas</span>
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Links */}
            <div className="py-2">
              {MORE_LINKS.map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors",
                    pathname.startsWith(href)
                      ? "text-primary"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0 text-muted-foreground" />
                  {label}
                </Link>
              ))}
            </div>

            {/* Sign out */}
            <div className="border-t mx-5 pt-3 pb-4">
              <button
                onClick={() =>
                  signOut({ callbackUrl: `${window.location.origin}/login` })
                }
                className="flex items-center gap-3 w-full py-3 text-sm font-medium text-destructive"
              >
                <LogOut className="w-5 h-5 shrink-0" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
