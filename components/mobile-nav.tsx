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

// ── 5 main tabs (spec: Inbox, Roster, Programs, Sessions, Outreach) ──────────
const MAIN_TABS = [
  {
    id: "inbox",
    label: "Inbox",
    icon: Inbox,
    href: "/inbox",
    activeOn: (p: string) => p === "/inbox" || p.startsWith("/inbox/"),
  },
  {
    id: "roster",
    label: "Roster",
    icon: Users,
    href: "/clients",
    activeOn: (p: string) =>
      p === "/clients" ||
      (p.startsWith("/clients/") && !p.includes("/log")),
  },
  {
    id: "programs",
    label: "Programs",
    icon: Dumbbell,
    href: "/programs",
    activeOn: (p: string) => p.startsWith("/programs"),
  },
  {
    id: "sessions",
    label: "Sessions",
    icon: ClipboardList,
    href: "/sessions",
    activeOn: (p: string) =>
      p === "/sessions" || p.includes("/log"),
  },
  {
    id: "outreach",
    label: "Outreach",
    icon: MessageSquare,
    href: "/outreach",
    activeOn: (p: string) => p.startsWith("/outreach"),
  },
] as const;

// ── More sheet links ──────────────────────────────────────────────────────────
const MORE_LINKS = [
  { href: "/intake",   icon: FileText,   label: "Intake" },
  { href: "/pricing",  icon: DollarSign, label: "Pricing" },
  { href: "/settings", icon: Settings,   label: "Settings" },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function MobileNav() {
  const pathname  = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  function haptic() {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  }

  const moreActive = MORE_LINKS.some((l) => pathname.startsWith(l.href));

  return (
    <>
      {/* ── Bottom tab bar ──────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{
          background: "var(--paper)",
          borderTop: "1px solid var(--line)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="h-16 flex items-stretch">
          {MAIN_TABS.map(({ id, label, icon: Icon, href, activeOn }) => {
            const active = activeOn(pathname);
            return (
              <Link
                key={id}
                href={href}
                onClick={haptic}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-opacity active:opacity-70"
                style={{ color: active ? "var(--blue)" : "var(--ink-mute)" }}
              >
                {/* Icon with glow indicator below when active */}
                <div className="relative flex items-center justify-center">
                  <Icon
                    className="w-5 h-5"
                    strokeWidth={active ? 2.25 : 1.75}
                  />
                  {active && (
                    <span
                      className="absolute -bottom-1.5 w-4 h-[3px] rounded-full"
                      style={{
                        background: "var(--blue)",
                        boxShadow: "0 0 6px 3px rgba(43,107,255,0.55)",
                      }}
                    />
                  )}
                </div>
                <span
                  className="text-[10px] font-medium tracking-wide leading-none mt-1"
                  style={{ color: active ? "var(--blue)" : "var(--ink-mute)" }}
                >
                  {label}
                </span>
              </Link>
            );
          })}

          {/* More tab */}
          <button
            onClick={() => { haptic(); setMoreOpen(true); }}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-opacity active:opacity-70"
            style={{ color: moreOpen || moreActive ? "var(--blue)" : "var(--ink-mute)" }}
          >
            <div className="relative flex items-center justify-center">
              <MoreHorizontal
                className="w-5 h-5"
                strokeWidth={moreOpen || moreActive ? 2.25 : 1.75}
              />
              {(moreOpen || moreActive) && (
                <span
                  className="absolute -bottom-1.5 w-4 h-[3px] rounded-full"
                  style={{
                    background: "var(--blue)",
                    boxShadow: "0 0 6px 3px rgba(43,107,255,0.55)",
                  }}
                />
              )}
            </div>
            <span className="text-[10px] font-medium tracking-wide leading-none mt-1">
              More
            </span>
          </button>
        </div>
      </nav>

      {/* ── More bottom sheet ────────────────────────────────────────────── */}
      {moreOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 md:hidden"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[24px] md:hidden"
            style={{
              background: "var(--paper)",
              borderTop: "1px solid var(--line)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div
                className="w-10 h-[3px] rounded-full"
                style={{ background: "var(--line)" }}
              />
            </div>

            {/* Header */}
            <div
              className="flex items-center justify-between px-5 pt-3 pb-3"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-[8px] flex items-center justify-center"
                  style={{
                    background: "var(--blue)",
                    boxShadow: "0 0 12px 3px rgba(43,107,255,0.50)",
                  }}
                >
                  <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
                </div>
                <span className="font-display text-lg" style={{ color: "var(--ink)" }}>
                  More
                </span>
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center min-h-[44px] min-w-[44px]"
                style={{ background: "rgba(11,15,26,0.05)" }}
              >
                <X className="w-4 h-4" style={{ color: "var(--ink-soft)" }} />
              </button>
            </div>

            {/* Links */}
            <div className="py-2">
              {MORE_LINKS.map(({ href, icon: Icon, label }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3.5 px-5 py-3.5 min-h-[56px] active:opacity-70 transition-opacity"
                    style={{ color: active ? "var(--blue)" : "var(--ink)" }}
                  >
                    <div
                      className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                      style={{
                        background: active ? "rgba(43,107,255,0.10)" : "rgba(11,15,26,0.05)",
                      }}
                    >
                      <Icon
                        className="w-[18px] h-[18px]"
                        style={{ color: active ? "var(--blue)" : "var(--ink-soft)" }}
                        strokeWidth={1.75}
                      />
                    </div>
                    <span className="font-body text-base font-medium">{label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Sign out */}
            <div
              className="mx-5 pt-2 pb-4"
              style={{ borderTop: "1px solid var(--line)" }}
            >
              <button
                onClick={() =>
                  signOut({ callbackUrl: `${window.location.origin}/login` })
                }
                className="flex items-center gap-3.5 w-full py-3 min-h-[44px] active:opacity-70 transition-opacity"
                style={{ color: "#DC2626" }}
              >
                <LogOut className="w-5 h-5 shrink-0" />
                <span className="font-body text-base font-medium">Sign out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
