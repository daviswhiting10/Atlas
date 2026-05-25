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

  return (
    <>
      {/* ── Bottom tab bar ──────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
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
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors min-h-[44px]",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5", active ? "stroke-[2.5]" : "stroke-[1.5]")} />
                {label}
              </Link>
            );
          })}

          {/* Log tab — opens client picker */}
          <button
            onClick={openLogPicker}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors min-h-[44px]",
              logActive || logPickerOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
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
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors min-h-[44px]",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5", active ? "stroke-[2.5]" : "stroke-[1.5]")} />
                {label}
              </Link>
            );
          })}

          {/* More tab */}
          <button
            onClick={() => { haptic(); setMoreOpen(true); }}
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

      {/* ── Log: client picker sheet ─────────────────────────────────────── */}
      {logPickerOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 md:hidden"
            onClick={() => setLogPickerOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl md:hidden flex flex-col"
            style={{
              paddingBottom: "env(safe-area-inset-bottom)",
              maxHeight: "75vh",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b shrink-0">
              <div>
                <p className="font-semibold text-base">Log a Session</p>
                <p className="text-xs text-muted-foreground">Select a client to begin</p>
              </div>
              <button
                onClick={() => setLogPickerOpen(false)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Client list */}
            <div className="overflow-y-auto flex-1 py-2">
              {logLoading ? (
                <div className="space-y-2 px-5 pt-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-[60px] bg-muted rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : logClients.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No active clients found.
                </div>
              ) : (
                logClients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => pickClient(client.id)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 active:bg-muted transition-colors touch-manipulation"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                        {client.fullName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <span className="text-sm font-medium">{client.fullName}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
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
            className="fixed inset-0 z-50 bg-black/40 md:hidden"
            onClick={() => setMoreOpen(false)}
          />
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
