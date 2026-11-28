"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, LogOut, MoreHorizontal, PlayCircle, RotateCcw, Scale, Settings } from "lucide-react";
import { LeaveSheet } from "@/components/athlete/LeaveSheet";
import { PasswordSheet } from "@/components/athlete/PasswordSheet";
import { BodyWeightSheet } from "@/components/athlete/BodyWeightSheet";
import { RestartPlanSheet } from "@/components/athlete/RestartPlanSheet";
import { DemoChip } from "@/components/DemoChip";
import { ModeToggle } from "@/components/ModeToggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { headerSlots, type HeaderAction, type Side } from "@/lib/header-actions";
import { signOutToLogin } from "@/lib/sign-out";
import { cn } from "@/lib/utils";

/** 44 px targets; the pressed look comes from PressFeedback (header links and buttons), the same as every tab. */
const ICON = "press flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink";

/**
 * The header's right side, for both sides of the app (one component, not a copy in each header).
 * What shows where is decided by lib/header-actions.
 */
export function HeaderActions({ side, demo, isCoach, restartPlan = false, canPassword = false, guest = false }: { side: Side; demo: boolean; isCoach: boolean; /** ...and Restart plan (not a guest or a demo account). */ restartPlan?: boolean; /** A real account (not a guest, a demo, or a coach: theirs is in Settings): Password. */ canPassword?: boolean; /** A guest: signing out asks first. */ guest?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [weighIn, setWeighIn] = useState(false);
  const [restart, setRestart] = useState(false);
  const [password, setPassword] = useState(false);
  const [leaving, setLeaving] = useState(false);

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
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {restartPlan && pathname.startsWith("/plan") && (
                <DropdownMenuItem className="min-h-11" onClick={() => setRestart(true)}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Restart plan
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="min-h-11" onClick={() => setWeighIn(true)}>
                <Scale className="mr-2 h-4 w-4" /> Add body weight
              </DropdownMenuItem>
              {canPassword && !isCoach && (
                <DropdownMenuItem className="min-h-11" onClick={() => setPassword(true)}>
                  <KeyRound className="mr-2 h-4 w-4" /> Password
                </DropdownMenuItem>
              )}
              {!demo && (
                <DropdownMenuItem className="min-h-11" onClick={() => router.push(`/demo?from=${encodeURIComponent(pathname)}`)}>
                  <PlayCircle className="mr-2 h-4 w-4" /> Demo
                </DropdownMenuItem>
              )}
              {/* An athlete's Sign out lives here only (a guest is asked first). */}
              {!isCoach && (
                <DropdownMenuItem
                  className="min-h-11"
                  onClick={() => {
                    if (guest) return void setLeaving(true);
                    void import("@/lib/sign-out").then((m) => m.signOutAndForget(`${window.location.origin}/`));
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              )}
              {/* A coach's phone has no More on the Me side: Settings and Sign out live here (desktop has the icons). */}
              {isCoach && (
                <>
                  <DropdownMenuItem className="min-h-11 md:hidden" onClick={() => router.push("/settings")}>
                    <Settings className="mr-2 h-4 w-4" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11 md:hidden" onClick={() => void signOutToLogin()}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
    }
  };

  /** Each action once, shown where the list says: every size, desktop only, or phone only. */
  const where = { both: "", desktop: "hidden md:flex", phone: "md:hidden" } as const;
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      {headerSlots({ side, demo, isCoach }).map(({ action, where: w }) => (
        <div key={action} className={cn("flex items-center", where[w])}>
          {render(action)}
        </div>
      ))}
      {weighIn && <BodyWeightSheet onClose={() => setWeighIn(false)} />}
      {restart && <RestartPlanSheet onClose={() => setRestart(false)} />}
      {password && <PasswordSheet onClose={() => setPassword(false)} />}
      {leaving && <LeaveSheet onClose={() => setLeaving(false)} />}
    </div>
  );
}
