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
    items: [
      { href: "/inbox", icon: Inbox, label: "Inbox" },
    ],
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
    items: [
      { href: "/outreach", icon: MessageSquare, label: "Outreach" },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/pricing", icon: DollarSign, label: "Pricing" },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex fixed left-0 top-0 h-screen w-56 flex-col z-40"
      style={{
        background: "#07090F",
        borderRight: "1px solid #1A1D2E",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-4 h-14"
        style={{ borderBottom: "1px solid #1A1D2E" }}
      >
        <div
          className="flex items-center justify-center w-7 h-7 rounded-md"
          style={{
            background: "var(--blue)",
            boxShadow: "0 0 12px 2px rgba(37, 99, 235, 0.45)",
          }}
        >
          <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
        <span
          className="font-display text-base tracking-tight"
          style={{ color: "#E4E4E7" }}
        >
          Atlas
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {navItems.map((group) => (
          <div key={group.label} className="mb-5">
            <p
              className="text-[10px] font-medium px-2 mb-1 uppercase tracking-widest"
              style={{ color: "#3F3F52" }}
            >
              {group.label}
            </p>
            {group.items.map(({ href, icon: Icon, label }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "relative flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors",
                    active
                      ? "text-white"
                      : "hover:text-white"
                  )}
                  style={
                    active
                      ? {
                          background: "#111420",
                          color: "#FFFFFF",
                          boxShadow: "inset 2px 0 0 var(--blue)",
                        }
                      : { color: "#8888A0" }
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
      <div style={{ borderTop: "1px solid #1A1D2E" }} className="p-2">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors"
          )}
          style={
            pathname === "/settings"
              ? {
                  background: "#111420",
                  color: "#FFFFFF",
                  boxShadow: "inset 2px 0 0 var(--blue)",
                }
              : { color: "#8888A0" }
          }
        >
          <Settings
            className="w-4 h-4 shrink-0"
            style={{ color: pathname === "/settings" ? "var(--blue)" : undefined }}
          />
          Settings
        </Link>
        <div className="mt-2 px-2 py-2">
          <p className="text-xs font-medium" style={{ color: "#6B6B80" }}>
            Davis Whiting
          </p>
          <p className="text-xs" style={{ color: "#3F3F52" }}>
            NASM CPT · CNC
          </p>
          <button
            onClick={() => signOut({ callbackUrl: `${window.location.origin}/login` })}
            className="mt-2 text-xs transition-colors hover:text-red-400"
            style={{ color: "#3F3F52" }}
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
