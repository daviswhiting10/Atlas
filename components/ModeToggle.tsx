"use client";

import Link from "next/link";
import { useModeSwitch } from "@/components/mode/context";
import { HOME, type Mode } from "@/lib/mode";
import { cn } from "@/lib/utils";

/**
 * Coach | Me, top right, for coaches only. This switches what's in the header and bottom bar: the coach's screens, or
 * their own training (the athlete app on their own profile). Each side opens on its home.
 *
 * A tap switches at once: the other side's header and bottom bar appear while its page loads (components/mode).
 * Without JavaScript, or with a modified click, it is two plain links. The pressed look comes from PressFeedback.
 */
export function ModeToggle({ mode }: { mode: Mode }) {
  const sw = useModeSwitch();
  const shown = sw?.shown ?? mode;
  const item = (on: boolean) =>
    cn("press flex h-11 items-center rounded-full px-4 text-[14px] font-semibold", on ? "bg-dusk-selected text-dusk-selected-text" : "text-ink-soft hover:text-ink");
  const link = (side: Mode, label: string) => (
    <Link
      href={HOME[side]}
      prefetch
      aria-current={shown === side ? "page" : undefined}
      className={item(shown === side)}
      onClick={(e) => {
        if (!sw || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        sw.go(side);
      }}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Coach or my training" className="flex shrink-0 rounded-full border border-line-strong p-0.5">
      {link("coach", "Coach")}
      {link("me", "Me")}
    </nav>
  );
}
