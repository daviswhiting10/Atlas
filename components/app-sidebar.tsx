"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Inbox,
  Users,
  UserPlus,
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
      { href: "/leads", icon: UserPlus, label: "Pipeline" },
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
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-56 flex-col bg-[var(--sidebar)] border-r border-[var(--sidebar-border)] z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-[var(--sidebar-border)]">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--sidebar-primary)]">
          <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-[var(--sidebar-foreground)] font-semibold tracking-tight text-base">
          Atlas
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {navItems.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="text-xs font-medium text-zinc-500 px-2 mb-1 uppercase tracking-wider">
              {group.label}
            </p>
            {group.items.map(({ href, icon: Icon, label }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors",
                    active
                      ? "bg-[var(--sidebar-accent)] text-white font-medium"
                      : "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-white"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-[var(--sidebar-border)] p-2">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors",
            pathname === "/settings"
              ? "bg-[var(--sidebar-accent)] text-white"
              : "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-white"
          )}
        >
          <Settings className="w-4 h-4 shrink-0" />
          Settings
        </Link>
        <div className="mt-2 px-2 py-2">
          <p className="text-xs font-medium text-zinc-400">Davis Whiting</p>
          <p className="text-xs text-zinc-600">NASM CPT · CNC</p>
          <button
            onClick={() => signOut({ callbackUrl: `${window.location.origin}/login` })}
            className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
