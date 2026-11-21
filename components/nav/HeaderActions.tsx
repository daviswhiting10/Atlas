"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, MoreHorizontal, Settings } from "lucide-react";
import { DemoChip } from "@/components/DemoChip";
import { ModeToggle } from "@/components/ModeToggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { headerActions, type HeaderAction, type Side } from "@/lib/header-actions";
import { signOutToLogin } from "@/lib/sign-out";
import { cn } from "@/lib/utils";

/** 44 px targets; the pressed look comes from PressFeedback (header links and buttons), the same as every tab. */
const ICON = "press flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink";

/**
 * The header's right side, for both sides of the app (one component, not a copy in each header).
 * What shows where is decided by lib/header-actions.
 */
export function HeaderActions({ side, demo, isCoach }: { side: Side; demo: boolean; isCoach: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { desktop, phone } = headerActions({ side, demo, isCoach });

  const render = (a: HeaderAction) => {
    switch (a) {
      case "demo":
        return <DemoChip key="demo" />;
      case "mode":
        return <ModeToggle key="mode" mode={side} />;
      case "settings":
        return (
          <Link key="settings" href="/settings" prefetch aria-label="Settings" className={cn(ICON, pathname === "/settings" && "bg-ink/5 text-ink")}>
            <Settings className="h-5 w-5" />
          </Link>
        );
      case "signout":
        return (
          <button key="signout" type="button" onClick={() => void signOutToLogin()} aria-label="Sign out" className={ICON}>
            <LogOut className="h-5 w-5" />
          </button>
        );
      case "account":
        return (
          <DropdownMenu key="account">
            <DropdownMenuTrigger aria-label="Account" className={ICON}>
              <MoreHorizontal className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuItem className="min-h-11" onClick={() => router.push("/settings")}>
                <Settings className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onClick={() => void signOutToLogin()}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="hidden items-center gap-1 md:flex">{desktop.map(render)}</div>
      <div className="flex items-center gap-1 md:hidden">{phone.map(render)}</div>
    </div>
  );
}
