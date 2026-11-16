"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * An exercise name. Never cut off with an ellipsis: it wraps to two lines, and
 * a name that still doesn't fit can be tapped to show the whole of it.
 *
 * Inside a button or link (`inControl`), the tap belongs to that control, so
 * the name isn't clamped at all: it wraps onto as many lines as it needs.
 * `title` and the accessible text always carry the full name.
 */
export function ExerciseName({
  name,
  className,
  inControl = false,
  as: Tag = "span",
}: {
  name: string;
  className?: string;
  inControl?: boolean;
  as?: "span" | "p" | "h2" | "h3";
}) {
  const ref = useRef<HTMLElement>(null);
  const [clamped, setClamped] = useState(false);
  const [open, setOpen] = useState(false);

  // Is the name longer than two lines? Checked again whenever its width changes.
  useEffect(() => {
    const el = ref.current;
    if (!el || inControl) return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [name, inControl]);

  const tappable = !inControl && (clamped || open);
  return (
    <Tag
      ref={ref as never}
      title={name}
      className={cn("min-w-0 break-words [overflow-wrap:anywhere]", !open && !inControl && "line-clamp-2", tappable && "cursor-pointer", className)}
      {...(tappable
        ? {
            role: "button",
            tabIndex: 0,
            "aria-expanded": open,
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              setOpen((o) => !o);
            },
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpen((o) => !o);
              }
            },
          }
        : {})}
    >
      {name}
    </Tag>
  );
}
