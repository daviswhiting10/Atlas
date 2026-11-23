"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Pencil, Sparkles, Upload } from "lucide-react";
import { toggleDoor, type Door } from "@/lib/plan-start";
import { cn } from "@/lib/utils";

/** The three rows (layout A), same on the coach's Plan tab and the athlete's Today. */
export const DOOR_ROWS: Array<{ door: Door; title: string; meta: string; icon: typeof Upload }> = [
  { door: "import", title: "Import", meta: "PDF, spreadsheet or screenshots", icon: Upload },
  { door: "own", title: "Build it myself", meta: "Start empty and add exercises", icon: Pencil },
  { door: "atlas", title: "Atlas builds it", meta: "From your goal", icon: Sparkles },
];

/**
 * Three rows. Opening one opens it in place and closes the others; each shows only what it needs.
 * `rows` lets a screen word the rows for itself; `panel` renders what is inside an open row.
 */
export function DoorRows({
  initialDoor = null,
  rows = DOOR_ROWS,
  panel,
  idPrefix = "plan-start",
  className = "mb-4 overflow-hidden rounded-xl border bg-card",
  scroll = true,
}: {
  initialDoor?: Door | null;
  rows?: typeof DOOR_ROWS;
  panel: (door: Door) => ReactNode;
  idPrefix?: string;
  className?: string;
  /** Bring an opened row to the top of the screen. */
  scroll?: boolean;
}) {
  const [open, setOpen] = useState<Door | null>(initialDoor);
  // Pressed from the first touch, before the tap finishes: Safari doesn't paint :active on its own.
  const [down, setDown] = useState<Door | null>(null);
  const rowRefs = useRef<Partial<Record<Door, HTMLDivElement | null>>>({});
  const first = useRef(true);

  // A row that opens comes up to the top, so its panel has the room (and clears the bottom bar).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (open == null) return;
    }
    if (scroll && open) rowRefs.current[open]?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [open, scroll]);

  return (
    <div className={className}>
      {rows.map(({ door, title, meta, icon: Icon }, i) => {
        const isOpen = open === door;
        return (
          <div key={door} ref={(el) => void (rowRefs.current[door] = el)} className={cn("scroll-mt-16", i > 0 && "border-t border-line")}>
            <button
              type="button"
              id={`${idPrefix}-${door}`}
              aria-expanded={isOpen}
              aria-controls={`${idPrefix}-panel-${door}`}
              onClick={() => setOpen((o) => toggleDoor(o, door))}
              onPointerDown={() => setDown(door)}
              onPointerUp={() => setDown(null)}
              onPointerCancel={() => setDown(null)}
              onPointerLeave={() => setDown(null)}
              className={cn(
                "flex min-h-[64px] w-full touch-manipulation select-none items-center gap-3.5 px-4 py-2.5 text-left [-webkit-tap-highlight-color:transparent]",
                down === door ? "bg-ink/10" : "hover:bg-ink/[0.03]"
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/10">
                <Icon className="h-5 w-5 text-ink" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold text-ink">{title}</span>
                {!isOpen && <span className="block truncate text-xs text-ink-mute">{meta}</span>}
              </span>
              <ChevronDown className={cn("h-5 w-5 shrink-0 text-ink-mute transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div id={`${idPrefix}-panel-${door}`} role="region" aria-labelledby={`${idPrefix}-${door}`} className="fade-in px-4 pb-5 pt-1">
                {panel(door)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
