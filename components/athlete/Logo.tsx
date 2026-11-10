import { cn } from "@/lib/utils";

export function Logo({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-blue shadow-[0_6px_16px_-6px_rgba(43,107,255,0.8)]">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M2.5 13.5 7 9l3 2.5 5.5-7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="15.5" cy="4.5" r="1.6" fill="#fff" />
        </svg>
      </span>
      <span className={cn("font-display text-[22px] leading-none", tone === "light" ? "text-white" : "text-ink")}>Atlas</span>
    </span>
  );
}
