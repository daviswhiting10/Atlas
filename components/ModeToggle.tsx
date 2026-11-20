import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Coach | Me, top right, for coaches only. The header and the bottom bar stay where they are;
 * this switches what's in them: the coach's screens, or their own training (the athlete app on
 * their own profile). Each side opens on its home.
 */
export function ModeToggle({ mode }: { mode: "coach" | "me" }) {
  const item = (on: boolean) =>
    cn("press flex h-11 items-center rounded-full px-4 text-[14px] font-semibold", on ? "bg-dusk-selected text-dusk-selected-text" : "text-ink-soft hover:text-ink");
  return (
    <nav aria-label="Coach or my training" className="flex shrink-0 rounded-full border border-line-strong p-0.5">
      <Link href="/log" aria-current={mode === "coach" ? "page" : undefined} className={item(mode === "coach")}>
        Coach
      </Link>
      <Link href="/today" aria-current={mode === "me" ? "page" : undefined} className={item(mode === "me")}>
        Me
      </Link>
    </nav>
  );
}
