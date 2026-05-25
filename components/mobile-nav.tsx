"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Static tab definitions (excludes Log which is special) ───────────────────

const LEFT_TABS = [
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
] as const;

const RIGHT_TABS = [
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

type ClientRow = { id: string; fullName: string; status: string };

// ── Component ─────────────────────────────────────────────────────────────────

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [moreOpen, setMoreOpen] = useState(false);
  const [logPickerOpen, setLogPickerOpen] = useState(false);
  const [logClients, setLogClients] = useState<ClientRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  function haptic() {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  }

  async function openLogPicker() {
    haptic();
    setLogPickerOpen(true);
    if (logClients.length === 0) {
      setLogLoading(true);
      try {
        const data = await fetch("/api/clients").then((r) => r.json());
        const rows: ClientRow[] = Array.isArray(data)
          ? (data as ClientRow[])
              .filter((c) => c.status === "ACTIVE" || c.status === "PROSPECT")
              .sort((a, b) => a.fullName.localeCompare(b.fullName))
          : [];
        setLogClients(rows);
      } finally {
        setLogLoading(false);
      }
    }
  }

  function pickClient(clientId: string) {
    haptic();
    setLogPickerOpen(false);
    router.push(`/clients/${clientId}/log`);
  }

  const logActive = pathname.includes("/log");
  const moreActive =
    MORE_LINKS.some((l) => pathname.startsWith(l.href)) ||
    pathname.startsWith("/sessions");

  // Shared tab item styles
  const tabBase =
    "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium tracking-wide transition-colors min-h-[44px]";

  return (
    <>
      {/* ── Bottom tab bar ──────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t md:hidden"
        style={{
          background: "var(--paper)",
          borderColor: "var(--line)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="h-16 flex items-stretch">
          {/* Left tabs */}
          {LEFT_TABS.map(({ id, label, icon: Icon, href, activeOn }) => {
            const active = activeOn(pathname);
            return (
              <Link
                key={id}
                href={href}
                onClick={haptic}
                className={cn(tabBase)}
                style={{ color: active ? "var(--blue)" : "var(--ink-mute)" }}
              >
                <Icon
                  className={cn("w-5 h-5", active ? "stroke-[2.5]" : "stroke-[1.5]")}
                />
                {label}
              </Link>
            );
          })}

          {/* Log tab — opens client picker */}
          <button
            onClick={openLogPicker}
            className={cn(tabBase)}
            style={{
              color: logActive || logPickerOpen ? "var(--blue)" : "var(--ink-mute)",
            }}
          >
            <ClipboardList
              className={cn(
                "w-5 h-5",
                logActive || logPickerOpen ? "stroke-[2.5]" : "stroke-[1.5]"
              )}
            />
            Log
          </button>

          {/* Right tabs */}
          {RIGHT_TABS.map(({ id, label, icon: Icon, href, activeOn }) => {
            const active = activeOn(pathname);
            return (
              <Link
                key={id}
                href={href}
                onClick={haptic}
                className={cn(tabBase)}
                style={{ color: active ? "var(--blue)" : "var(--ink-mute)" }}
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
            onClick={() => { haptic(); setMoreOpen(true); }}
            className={cn(tabBase)}
            style={{
              color: moreOpen || moreActive ? "var(--blue)" : "var(--ink-mute)",
            }}
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

      {/* ── Log: client picker sheet ─────────────────────────────────────── */}
      {logPickerOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/30 md:hidden backdrop-blur-sm"
            onClick={() => setLogPickerOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] md:hidden flex flex-col"
            style={{
              background: "var(--paper)",
              borderTop: "1px solid var(--line)",
              paddingBottom: "env(safe-area-inset-bottom)",
              maxHeight: "75vh",
            }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div
                className="w-10 h-1 rounded-full"
                style={{ background: "var(--line)" }}
              />
            </div>

            {/* Header */}
            <div
              className="flex items-center justify-between px-5 pt-3 pb-3"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <div>
                <p
                  className="font-display text-lg"
                  style={{ color: "var(--ink)" }}
                >
                  Log a Session
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--ink-mute)" }}>
                  Select a client to begin
                </p>
              </div>
              <button
                onClick={() => setLogPickerOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ background: "var(--muted)" }}
              >
                <X className="w-4 h-4" style={{ color: "var(--ink-soft)" }} />
              </button>
            </div>

            {/* Client list */}
            <div className="overflow-y-auto flex-1 py-2">
              {logLoading ? (
                <div className="space-y-2 px-5 pt-2">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="h-[60px] rounded-xl animate-pulse"
                      style={{ background: "var(--muted)" }}
                    />
                  ))}
                </div>
              ) : logClients.length === 0 ? (
                <div
                  className="px-5 py-10 text-center text-sm"
                  style={{ color: "var(--ink-mute)" }}
                >
                  No active clients found.
                </div>
              ) : (
                logClients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => pickClient(client.id)}
                    className="w-full flex items-center justify-between px-5 py-3.5 transition-colors touch-manipulation active:opacity-70"
                    style={{ color: "var(--ink)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                        style={{
                          background: "var(--blue-soft)",
                          color: "var(--blue)",
                        }}
                      >
                        {client.fullName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <span className="text-sm font-medium">{client.fullName}</span>
                    </div>
                    <ChevronRight
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--ink-mute)" }}
                    />
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ── More bottom sheet ────────────────────────────────────────────── */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/30 md:hidden backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] md:hidden"
            style={{
              background: "var(--paper)",
              borderTop: "1px solid var(--line)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div
                className="w-10 h-1 rounded-full"
                style={{ background: "var(--line)" }}
              />
            </div>

            {/* Header */}
            <div
              className="flex items-center justify-between px-5 pt-3 pb-3"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center"
                  style={{
                    background: "var(--blue)",
                    boxShadow: "0 0 8px 1px rgba(37,99,235,0.4)",
                  }}
                >
                  <Zap className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                </div>
                <span
                  className="font-display text-base"
                  style={{ color: "var(--ink)" }}
                >
                  Atlas
                </span>
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ background: "var(--muted)" }}
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
                    className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors"
                    style={{ color: active ? "var(--blue)" : "var(--ink)" }}
                  >
                    <Icon
                      className="w-5 h-5 shrink-0"
                      style={{ color: active ? "var(--blue)" : "var(--ink-mute)" }}
                    />
                    {label}
                  </Link>
                );
              })}
            </div>

            {/* Sign out */}
            <div
              className="mx-5 pt-3 pb-4"
              style={{ borderTop: "1px solid var(--line)" }}
            >
              <button
                onClick={() =>
                  signOut({ callbackUrl: `${window.location.origin}/login` })
                }
                className="flex items-center gap-3 w-full py-3 text-sm font-medium"
                style={{ color: "#DC2626" }}
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
