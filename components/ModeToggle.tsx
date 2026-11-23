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
  // One target, not two: it always goes to the side you are not on. The pill still shows both, with the current one lit.
  const other: Mode = shown === "coach" ? "me" : "coach";
  const label = (side: Mode) => (side === "coach" ? "Coach" : "Me");
  const part = (side: Mode) =>
    cn("flex h-9 items-center rounded-full px-4 text-[14px] font-semibold", shown === side ? "bg-dusk-selected text-dusk-selected-text" : "text-ink-soft");
  return (
    <Link
      href={HOME[other]}
      prefetch
      aria-label={`Switch to ${label(other)}`}
      className="press flex h-11 shrink-0 items-center rounded-full border border-line-strong p-0.5"
      onClick={(e) => {
        if (!sw || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        sw.go(other);
      }}
    >
      <span className={part("coach")}>Coach</span>
      <span className={part("me")}>Me</span>
    </Link>
  );
}
