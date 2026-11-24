import type { DayMode } from "@/lib/history/mode";

/** The corner icons, drawn to read at 8 to 11 px: a dumbbell, a shoe, a dot, and a small pair for a mixed day. */
export function ModeIcon({ mode, color, className }: { mode: DayMode; color: string; className?: string }) {
  switch (mode) {
    case "S":
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" className={className} aria-hidden>
          <path d="M1.5 8h13M4 4.5v7M12 4.5v7" />
          <path d="M2.2 6.2v3.6M13.8 6.2v3.6" strokeWidth="1.7" />
        </svg>
      );
    case "R":
      return (
        <svg viewBox="0 0 16 16" fill={color} className={className} aria-hidden>
          <path d="M1.5 11.8c0-1.6.6-2.6 1.5-3.4l1.2-2.6 1.6.9c.6.3 1.2.1 1.7-.3l.7-.6 1.7 1.5c.7.6 1.6 1 2.6 1.2 1.2.3 1.9 1 1.9 2.2v.2H1.5z" />
          <rect x="1.5" y="12" width="13" height="1.5" rx=".7" />
        </svg>
      );
    case "W":
      return (
        <svg viewBox="0 0 16 16" fill={color} className={className} aria-hidden>
          <circle cx="8" cy="8" r="3.4" />
        </svg>
      );
    case "M":
      return (
        <svg viewBox="0 0 24 16" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" className={className} aria-hidden>
          <path d="M1 8h9M2.6 4.8v6.4M8.4 4.8v6.4" />
          <path d="M13 12.5c0-1.4.6-2.3 1.4-3l1-2.2 1.4.8c.5.3 1 .1 1.5-.3l.6-.5 1.5 1.3c.6.5 1.4.9 2.3 1 1 .3 1.6.9 1.6 1.9v.1H13z" fill={color} stroke="none" />
        </svg>
      );
  }
}

export const MODE_LABEL: Record<DayMode, string> = { S: "strength", R: "cardio", W: "walk", M: "strength and cardio" };
