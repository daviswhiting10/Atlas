import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The grip on an exercise card: grab it with a mouse and drag, or focus it and use the keyboard (Space picks the card up,
 * the arrows move it, Space drops it, Escape cancels). The props come from `useDragOrder().handle(id, name)`.
 */
export function DragHandle({ props, className }: { props: Record<string, unknown>; className?: string }) {
  return (
    <span
      {...props}
      className={cn(
        "no-select flex h-11 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-ink-mute outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--dusk-teal)] active:cursor-grabbing aria-pressed:text-[var(--dusk-teal)]",
        className
      )}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </span>
  );
}

/** Says each step of a keyboard move aloud for a screen reader; draws nothing. */
export function DragStatus({ message }: { message: string }) {
  return (
    <p role="status" aria-live="assertive" className="sr-only">
      {message}
    </p>
  );
}
