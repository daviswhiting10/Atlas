"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/today", label: "Today", icon: Calendar },
  { href: "/plan", label: "Plan", icon: ClipboardList },
];

export default function ClientTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 border-t border-border bg-background/95 backdrop-blur flex">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <Icon className={cn("w-5 h-5", active && "text-primary")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
