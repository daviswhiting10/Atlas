import Link from "next/link";
import { cn } from "@/lib/utils";

/** Profile | Nutrition, at the top of You. Only drawn while the NUTRITION flag is on. */
export function YouTabs({ active }: { active: "profile" | "nutrition" }) {
  const item = (on: boolean) => cn("press flex h-11 flex-1 items-center justify-center rounded-xl text-[16px] font-medium", on ? "bg-dusk-selected text-dusk-selected-text" : "text-ink-soft");
  return (
    <nav aria-label="You" className="mb-6 flex rounded-2xl bg-ink/[0.06] p-1">
      <Link href="/you" prefetch aria-current={active === "profile" ? "page" : undefined} className={item(active === "profile")}>
        Profile
      </Link>
      <Link href="/you/nutrition" prefetch aria-current={active === "nutrition" ? "page" : undefined} className={item(active === "nutrition")}>
        Nutrition
      </Link>
    </nav>
  );
}
