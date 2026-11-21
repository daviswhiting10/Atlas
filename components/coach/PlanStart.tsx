"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil, Sparkles, Upload } from "lucide-react";
import { SheetPlanUpload } from "@/components/coach/SheetPlanUpload";
import { AssignFromLibrary } from "@/components/coach/AssignFromLibrary";
import { CoachPlanForm } from "@/components/coach/CoachPlanForm";
import { toggleDoor, type Door } from "@/lib/plan-start";
import { cn } from "@/lib/utils";

const ROWS: Array<{ door: Door; title: string; meta: string; icon: typeof Upload }> = [
  { door: "import", title: "Import", meta: "Spreadsheet, photos or a Sheets link", icon: Upload },
  { door: "own", title: "Build it myself", meta: "From a program", icon: Pencil },
  { door: "atlas", title: "Atlas builds it", meta: "From their goal", icon: Sparkles },
];

/**
 * The Plan tab's way in: three rows. Opening one opens it in place and closes the others; each shows only what it needs.
 * Everything inside is the same as before (the importer, the library, the Atlas form), only folded behind its row.
 */
export function PlanStart({ client, initialDoor = null }: { client: { id: string; fullName: string; primaryGoal: string | null }; initialDoor?: Door | null }) {
  const firstName = client.fullName.split(" ")[0];
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
    if (open) rowRefs.current[open]?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [open]);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border bg-card">
      {ROWS.map(({ door, title, meta, icon: Icon }, i) => {
        const isOpen = open === door;
        return (
          <div key={door} ref={(el) => void (rowRefs.current[door] = el)} className={cn("scroll-mt-16", i > 0 && "border-t border-line")}>
            <button
              type="button"
              id={`plan-start-${door}`}
              aria-expanded={isOpen}
              aria-controls={`plan-start-panel-${door}`}
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
              <div id={`plan-start-panel-${door}`} role="region" aria-labelledby={`plan-start-${door}`} className="fade-in px-4 pb-5 pt-1">
                {door === "import" && <SheetPlanUpload clientId={client.id} firstName={firstName} />}
                {door === "own" && <AssignFromLibrary clientId={client.id} firstName={firstName} />}
                {door === "atlas" && <CoachPlanForm clients={[client]} fixedClientId={client.id} door />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
