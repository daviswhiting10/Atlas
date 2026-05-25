"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Inbox,
  Users,
  FileText,
  Dumbbell,
  MessageSquare,
  ClipboardList,
  Settings,
  Zap,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Today",
    items: [{ href: "/inbox", icon: Inbox, label: "Inbox" }],
  },
  {
    label: "Clients",
    items: [
      { href: "/clients", icon: Users, label: "Roster" },
      { href: "/intake", icon: FileText, label: "Intake" },
    ],
  },
  {
    label: "Training",
    items: [
      { href: "/programs", icon: Dumbbell, label: "Programs" },
      { href: "/sessions", icon: ClipboardList, label: "Sessions" },
    ],
  },
  {
    label: "Outreach",
    items: [{ href: "/outreach", icon: MessageSquare, label: "Outreach" }],
  },
  {
    label: "Business",
    items: [{ href: "/pricing", icon: DollarSign, label: "Pricing" }],
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside
      className="hidden md:flex fixed left-0 top-0 h-screen w-56 flex-col z-40"
      style={{
        background: "#07090F",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-4 h-14"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div
          className="relative flex items-center justify-center w-7 h-7 rounded-md"
          style={{
            background: "var(--blue)",
            boxShadow: "0 0 20px 6px rgba(43,107,255,0.55), 0 0 40px 10px rgba(123,167,255,0.20)",
          }}
        >
          <Zap className="w-4 h-4 text-white relative z-10" strokeWidth={2.5} />
        </div>
        <span
          className="font-display text-base tracking-tight"
          style={{ color: "#E4E6EC" }}
        >
          Atlas
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {navItems.map((group) => (
          <div key={group.label} className="mb-5">
            <p
              className="font-body text-[10px] font-medium px-2 mb-1 uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.18)" }}
            >
              {group.label}
            </p>
            {group.items.map(({ href, icon: Icon, label }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "relative flex items-center gap-2.5 px-2 py-2 rounded-md font-body text-sm transition-all",
                    active ? "text-white" : "hover:text-white"
                  )}
                  style={
                    active
                      ? {
                          background: "rgba(43,107,255,0.10)",
                          color: "#FFFFFF",
                          // 3px blue left rail with 12px blur halo
                          boxShadow: "inset 3px 0 0 var(--blue), inset 3px 0 12px rgba(43,107,255,0.45)",
                        }
                      : { color: "#6B7280" }
                  }
                >
                  <Icon
                    className="w-4 h-4 shrink-0"
                    style={{ color: active ? "var(--blue)" : undefined }}
                  />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div
        className="p-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Link
          href="/settings"
          className="flex items-center gap-2.5 px-2 py-2 rounded-md font-body text-sm transition-all"
          style={
            isActive("/settings")
              ? {
                  background: "rgba(43,107,255,0.10)",
                  color: "#FFFFFF",
                  boxShadow: "inset 3px 0 0 var(--blue), inset 3px 0 12px rgba(43,107,255,0.45)",
                }
              : { color: "#6B7280" }
          }
        >
          <Settings
            className="w-4 h-4 shrink-0"
            style={{ color: isActive("/settings") ? "var(--blue)" : undefined }}
          />
          Settings
        </Link>
        <div className="mt-2 px-2 py-2">
          <p className="font-body text-xs font-medium" style={{ color: "rgba(255,255,255,0.30)" }}>
            Davis Whiting
          </p>
          <p className="font-body text-xs" style={{ color: "rgba(255,255,255,0.15)" }}>
            NASM CPT · CNC
          </p>
          <button
            onClick={() => signOut({ callbackUrl: `${window.location.origin}/login` })}
            className="mt-2 font-body text-xs transition-colors hover:text-red-400"
            style={{ color: "rgba(255,255,255,0.18)" }}
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
