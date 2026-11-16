import { cn } from "@/lib/utils";

/** The mark: a teal tile with a dark rising line, and the name. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-signal">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M2.5 13.5 7 9l3 2.5 5.5-7" stroke="var(--dusk-button-text)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="15.5" cy="4.5" r="1.6" fill="var(--dusk-button-text)" />
        </svg>
      </span>
      <span className="font-display text-[22px] leading-none text-ink">Atlas</span>
    </span>
  );
}
