import { Check } from "lucide-react";

/** The round tick at the start of a checklist row. Styles: app/dusk.css, ".dusk-check". */
export function TickCircle({ on, needs = false }: { on: boolean; needs?: boolean }) {
  return (
    <span className="dusk-check" data-state={on ? "on" : needs ? "needs" : "off"}>
      <Check className="h-4 w-4" strokeWidth={2.5} />
    </span>
  );
}
